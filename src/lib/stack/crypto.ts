import type { Envelope, NoteContent, StackAccount, WrappedKeys } from './types'

const encoder = new TextEncoder()
export const ITEM_BYTES = 1024 * 1024
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function attachmentIDs(note: NoteContent): string[] {
	const refs = note.attachments
	if (!Array.isArray(refs) || refs.length > 32 || refs.some(file => !file || !uuid.test(file.id) || typeof file.name !== 'string' || typeof file.media_type !== 'string' || !Number.isSafeInteger(file.size) || file.size < 0 || decode64(file.nonce).length !== 12 || !/^[0-9a-f]{64}$/.test(file.sha256))) throw new Error('笔记附件清单不正确，已停止保存。')
	const ids = refs.map(file => file.id).sort()
	if (new Set(ids).size !== ids.length) throw new Error('笔记附件引用重复。')
	return ids
}

export function encode64(bytes: Uint8Array): string {
	let text = ''
	for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192))
	return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decode64(text: string): Uint8Array<ArrayBuffer> {
	if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) throw new Error('密钥或密文格式不正确。')
	const bytes = Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
	if (encode64(bytes) !== text) throw new Error('密钥或密文编码不正确。')
	return bytes
}

export const randomKey = () => crypto.getRandomValues(new Uint8Array(32))
const aad = (owner: string, purpose: string) => `stack:v1:keyring:${owner}:${purpose}`

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
	const { argon2id } = await import('hash-wasm')
	return new Uint8Array(await argon2id({ password: passphrase, salt, memorySize: 65536, iterations: 3, parallelism: 1, hashLength: 32, outputType: 'binary' }))
}

export async function importDataKey(raw: Uint8Array) {
	return crypto.subtle.importKey('raw', new Uint8Array(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

type DataKey = Uint8Array | CryptoKey
const aes = (key: DataKey) => key instanceof Uint8Array ? importDataKey(key) : key

export async function seal(rawKey: DataKey, bytes: Uint8Array, context: string) {
	const nonce = crypto.getRandomValues(new Uint8Array(12))
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(context), tagLength: 128 }, await aes(rawKey), new Uint8Array(bytes))
	return { nonce: encode64(nonce), ciphertext: encode64(new Uint8Array(ciphertext)) }
}

export async function open(rawKey: DataKey, nonce: string, ciphertext: string, context: string) {
	return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode64(nonce), additionalData: encoder.encode(context), tagLength: 128 }, await aes(rawKey), decode64(ciphertext)))
}

export async function wrapKeys(owner: string, passphrase: string, dataKey: Uint8Array) {
	const salt = crypto.getRandomValues(new Uint8Array(16))
	const recovery = randomKey()
	const passwordKey = await deriveKey(passphrase, salt)
	try {
		const first = await seal(passwordKey, dataKey, aad(owner, 'passphrase'))
		const second = await seal(recovery, dataKey, aad(owner, 'recovery'))
		// Verify both new wrappers before the server can replace the keyring.
		for (const [key, wrap, purpose] of [[passwordKey, first, 'passphrase'], [recovery, second, 'recovery']] as const) {
			const check = await open(key, wrap.nonce, wrap.ciphertext, aad(owner, purpose))
			const matches = check.every((byte, i) => byte === dataKey[i]) && check.length === 32
			check.fill(0)
			if (!matches) throw new Error('密钥封装校验失败，请重试。')
		}
		const body: WrappedKeys = { kdf_salt: encode64(salt), wrap_nonce: first.nonce, wrapped_data_key: first.ciphertext, recovery_wrap_nonce: second.nonce, recovery_wrapped_data_key: second.ciphertext }
		return { body, recovery: encode64(recovery) }
	} finally { passwordKey.fill(0); recovery.fill(0) }
}

export async function unlockKey(owner: string, account: StackAccount, secret: string, recovery = false) {
	const kdf = account.kdf
	if (account.protocol_version !== 1 || kdf.name !== 'argon2id' || kdf.memory_kib !== 65536 || kdf.iterations !== 3 || kdf.parallelism !== 1) throw new Error('此空间的加密协议不受支持。')
	const key = recovery ? decode64(secret.trim()) : await deriveKey(secret, decode64(kdf.salt))
	try {
		if (key.length !== 32) throw new Error('恢复密钥需为完整的 43 位字符。')
		const bytes = await open(key, recovery ? account.recovery_wrap_nonce : account.wrap_nonce, recovery ? account.recovery_wrapped_data_key : account.wrapped_data_key, aad(owner, recovery ? 'recovery' : 'passphrase'))
		if (bytes.length !== 32) throw new Error('数据密钥长度不正确。')
		return bytes
	} finally { key.fill(0) }
}

export async function encryptNote(key: DataKey, owner: string, id: string, revision: number, note: NoteContent) {
	attachmentIDs(note)
	const bytes = encoder.encode(JSON.stringify(note))
	if (bytes.length + 16 > ITEM_BYTES) throw new Error('这篇笔记超过 1 MiB，请缩短内容后保存。')
	return { protocol_version: 1, ...await seal(key, bytes, `stack:v1:item:${owner}:${id}:${revision}`) }
}

export async function decryptNote(key: DataKey, owner: string, item: Envelope): Promise<NoteContent> {
	if (item.protocol_version !== 1) throw new Error('笔记加密协议不受支持。')
	const bytes = await open(key, item.nonce, item.ciphertext, `stack:v1:item:${owner}:${item.item_id}:${item.revision}`)
	const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
	if (!value || value.schema !== 1 || value.kind !== 'note' || (value.folder_id !== null && (typeof value.folder_id !== 'string' || !uuid.test(value.folder_id))) || value.format !== 'markdown' || typeof value.title !== 'string' || typeof value.body !== 'string' || !Array.isArray(value.tags) || !value.tags.every((tag: unknown) => typeof tag === 'string') || typeof value.favorite !== 'boolean' || typeof value.trashed !== 'boolean') throw new Error('笔记内容格式不受支持，已停止同步以保护原始数据。')
	const ids = attachmentIDs(value)
	if (!Array.isArray(item.attachment_ids) || JSON.stringify(ids) !== JSON.stringify([...item.attachment_ids].sort())) throw new Error('附件清单与服务器引用不一致，已停止同步。')
	return value
}
