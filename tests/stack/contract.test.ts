import { afterAll, beforeAll, expect, it } from 'vitest'
import { startPocketBase } from './pocketbase-fixture.mjs'
import { ClientResponseError } from 'pocketbase'
import { checkBootstrap } from '@/lib/stack/api'
import { randomKey, seal, unlockKey, wrapKeys } from '@/lib/stack/crypto'
import { WorkspaceSession, type Transport } from '@/lib/stack/workspace'
import type { Bootstrap, StackAccount } from '@/lib/stack/types'

// Runs only through the Docker task. All credentials and data are disposable.
const archive = process.env.INKSTACK_TEST_ARCHIVE
let base: string, owner: string, token: string, account: StackAccount
let fixture: Awaited<ReturnType<typeof startPocketBase>>
const password = 'Disposable-Contract-Test-Only-2026'
const key = randomKey()
async function json(path: string, method = 'GET', body?: unknown, auth = token, epoch?: string) {
	const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}), ...(epoch ? { 'X-Inkstack-Epoch': epoch } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
	const data = await response.json()
	if (!response.ok) throw new ClientResponseError({ status: response.status, response: data })
	return data
}
const request: Transport = (path, method, body, epoch) => json('/api/stack/v1' + path, method, body, token, epoch)

beforeAll(async () => {
	if (!archive) return
	fixture = await startPocketBase(archive)
	base = fixture.url; owner = fixture.owner; token = fixture.token
	expect(checkBootstrap(await json('/api/stack/v1/bootstrap') as Bootstrap).state).toBe('empty')
	const wrapped = await wrapKeys(owner, password, key)
	account = (await json('/api/stack/v1/setup', 'POST', wrapped.body)).account
	expect(await unlockKey(owner, account, password)).toEqual(key)
}, 30_000)

afterAll(async () => {
	await fixture?.close()
	key.fill(0)
})

it.skipIf(!archive)('round-trips encrypted notes, receipts, attachments and keyring through real PocketBase', async () => {
	let lose = false
	const unreliable: Transport = async (path, method, body, epoch) => {
		const result = await request(path, method, body, epoch)
		if (lose && method !== 'GET') { lose = false; throw new ClientResponseError({ status: 0 }) }
		return result
	}
	const a = new WorkspaceSession(owner, key, account.sync_epoch, unreliable)
	const b = new WorkspaceSession(owner, key, account.sync_epoch, request)
	try {
		await a.load()
		const id = a.create(); a.edit(id, { body: '真实接口与中文密文' })
		lose = true; await a.flush(); expect(a.getSnapshot().unsaved).toBe(true)
		await a.flush(); expect(a.getSnapshot().error).toBe('')
		await b.load(); expect(b.getSnapshot().notes[0].content.body).toBe('真实接口与中文密文')
		const attachmentID = crypto.randomUUID()
		const attachment = await seal(key, new TextEncoder().encode('file'), `stack:v1:attachment:${owner}:${id}:${attachmentID}`)
		const bytes = Buffer.from(attachment.ciphertext, 'base64url')
		const uploaded = await fetch(`${base}/api/stack/v1/items/${id}/attachments/${attachmentID}`, { method: 'PUT', headers: { Authorization: token, 'Content-Type': 'application/octet-stream', 'X-Inkstack-Epoch': account.sync_epoch, 'X-Inkstack-Nonce': attachment.nonce }, body: bytes })
		expect(uploaded.status).toBe(201)
		const metadata = (await uploaded.json()).attachment
		a.edit(id, { attachments: [{ id: attachmentID, name: 'example.txt', size: 4, media_type: 'text/plain', nonce: attachment.nonce, sha256: metadata.sha256 }] })
		await a.flush(); a.edit(id, { title: '保留附件' }); await a.flush()
		await b.sync(); expect(b.getSnapshot().error).toBe('')
		expect(b.getSnapshot().notes[0].content.attachments[0].id).toBe(attachmentID)
		a.edit(id, { body: 'device A' }); b.edit(id, { body: 'device B' })
		await a.flush(); await b.flush(); expect(b.getSnapshot().notes[0].conflict).toBeDefined()
		const wrapped = await wrapKeys(owner, 'A new independent encryption passphrase', key)
		await expect(json('/api/stack/v1/keyring', 'PUT', { ...wrapped.body, base_key_revision: account.key_revision })).rejects.toMatchObject({ status: 400 })
		const updated = await json('/api/stack/v1/keyring', 'PUT', { ...wrapped.body, base_key_revision: account.key_revision }, token, account.sync_epoch)
		expect(await unlockKey(owner, updated.account, wrapped.recovery, true)).toEqual(key)
		lose = true; await a.remove(id); expect(a.getSnapshot().unsaved).toBe(true)
		await a.flush(); expect(a.getSnapshot().notes).toEqual([])
	} finally { a.dispose(); b.dispose() }
}, 30_000)
