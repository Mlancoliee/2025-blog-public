import { createDecipheriv } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decode64, decryptNote, deriveKey, encode64, encryptNote, open, randomKey, unlockKey, wrapKeys } from '@/lib/stack/crypto'
import type { Envelope, NoteContent, StackAccount } from '@/lib/stack/types'

const note: NoteContent = { schema: 1, kind: 'note', format: 'markdown', folder_id: null, attachments: [], title: '中文笔记', body: '秘密代码\n```go\nfmt.Println("hello")\n```', tags: ['代码'], favorite: true, trashed: false }
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('InkStack v1 browser encryption', () => {
	it('matches an independent Go Argon2id and AES-GCM fixed vector', async () => {
		// Generated with golang.org/x/crypto/argon2.IDKey and crypto/cipher.
		// Salt = 16 bytes of 7, nonce = 12 bytes of 9, data key = 32 bytes of 42.
		const key = await deriveKey('Inkstack fixture passphrase', decode64('BwcHBwcHBwcHBwcHBwcHBw'))
		expect(encode64(key)).toBe('S5ce9lgGhcHUpDvtHH6mWH7hBeKgF3Ik0UMbW5tBkQ0')
		const plaintext = await open(key, 'CQkJCQkJCQkJCQkJ', 'L2eXjVNOPAxQDya5Ki629dmlUsphL7GeaJyO1_njmr73zub_rydXlH4A8Lv_3V_T', 'stack:v1:keyring:fixture-owner:passphrase')
		expect(encode64(plaintext)).toBe('KioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKio')
	})
	it('interoperates with independent AES-GCM decryption and binds owner/id/revision', async () => {
		const key = new Uint8Array(32).fill(7)
		const wire = await encryptNote(key, 'owner', id, 1, note)
		const bytes = decode64(wire.ciphertext)
		const decipher = createDecipheriv('aes-256-gcm', key, decode64(wire.nonce))
		decipher.setAAD(Buffer.from(`stack:v1:item:owner:${id}:1`))
		decipher.setAuthTag(bytes.slice(-16))
		expect(JSON.parse(Buffer.concat([decipher.update(bytes.slice(0, -16)), decipher.final()]).toString('utf8'))).toEqual(note)
		const item: Envelope = { ...wire, item_id: id, revision: 1, deleted: false, attachment_ids: [], change_sequence: 1, created: '', updated: '' }
		expect(await decryptNote(key, 'owner', item)).toEqual(note)
		await expect(decryptNote(key, 'different-owner', item)).rejects.toThrow()
		await expect(decryptNote(key, 'owner', { ...item, revision: 2 })).rejects.toThrow()
		bytes[0] ^= 1
		await expect(decryptNote(key, 'owner', { ...item, ciphertext: encode64(bytes) })).rejects.toThrow()
		expect((await encryptNote(key, 'owner', id, 1, note)).nonce).not.toBe(wire.nonce)
	})
	it('unlocks both verified key wrappers and rejects a wrong password', async () => {
		const key = randomKey()
		const result = await wrapKeys('owner', 'correct passphrase for test', key)
		const account: StackAccount = { ...result.body, protocol_version: 1, key_revision: 1, kdf: { name: 'argon2id', salt: result.body.kdf_salt, memory_kib: 65536, iterations: 3, parallelism: 1 }, sync_head: 0, sync_epoch: 'a'.repeat(32), used_bytes: 0, item_count: 0 }
		expect(await unlockKey('owner', account, 'correct passphrase for test')).toEqual(key)
		expect(await unlockKey('owner', account, result.recovery, true)).toEqual(key)
		await expect(unlockKey('owner', account, 'wrong passphrase')).rejects.toThrow()
		await expect(unlockKey('another-owner', account, result.recovery, true)).rejects.toThrow()
	})
	it('enforces ciphertext size, including UTF-8 expansion and the GCM tag', async () => {
		await expect(encryptNote(randomKey(), 'owner', id, 1, { ...note, body: '字'.repeat(350000) })).rejects.toThrow('1 MiB')
	})
})
