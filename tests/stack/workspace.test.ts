import { ClientResponseError } from 'pocketbase'
import { describe, expect, it } from 'vitest'
import { WorkspaceSession } from '@/lib/stack/workspace'
import { decryptNote, randomKey } from '@/lib/stack/crypto'
import type { Envelope } from '@/lib/stack/types'
const epoch = 'a'.repeat(32)

function server() {
	const records = new Map<string, Envelope>()
	const writes: Record<string, unknown>[] = []
	let sequence = 0
	let generation = epoch
	const receipts = new Map<string, { digest: string; operation: Record<string, unknown> }>()
	let loseResponse = false
	let beforeWrite: (() => Promise<void>) | undefined
	async function request<T>(path: string, method = 'GET', raw?: unknown, suppliedEpoch?: string): Promise<T> {
		if (suppliedEpoch !== generation) throw new ClientResponseError({ status: suppliedEpoch ? 409 : 400, response: { error: { code: suppliedEpoch ? 'sync_reset_required' : 'sync_epoch_required' } } })
		if (path.startsWith('/sync')) {
			const since = Number(new URLSearchParams(path.split('?')[1]).get('since'))
			return { owner_id: 'owner', sync_epoch: generation, items: [...records.values()].filter(row => row.change_sequence > since), next_cursor: sequence, has_more: false } as T
		}
		const body = raw as Record<string, unknown>
		await beforeWrite?.()
		writes.push(structuredClone(body))
		const id = (body.item_id as string) || path.split('/').pop()!
		const previous = records.get(id)
		const operationID = body.operation_id as string
		if (!operationID) throw new ClientResponseError({ status: 400 })
		const digest = JSON.stringify({ path, method, body })
		const receipt = receipts.get(operationID)
		if (receipt) {
			if (receipt.digest !== digest) throw new ClientResponseError({ status: 409, response: { error: { code: 'operation_conflict' } } })
			return { item: previous, operation: receipt.operation, sync_epoch: generation, replayed: true } as T
		}
		if ((previous?.revision ?? 0) !== body.base_revision) throw new ClientResponseError({ status: 409, response: { current: previous } })
		const item: Envelope = { item_id: id, protocol_version: 1, revision: (previous?.revision ?? 0) + 1, change_sequence: ++sequence, nonce: method === 'DELETE' ? '' : body.nonce as string, ciphertext: method === 'DELETE' ? '' : body.ciphertext as string, attachment_ids: method === 'DELETE' ? [] : body.attachment_ids as string[], deleted: method === 'DELETE', created: previous?.created || new Date().toISOString(), updated: new Date().toISOString() }
		records.set(id, item)
		const operation = { operation_id: operationID, item_id: id, revision: item.revision, change_sequence: sequence, deleted: item.deleted, expires: Date.now() + 86400000 }
		receipts.set(operationID, { digest, operation })
		if (loseResponse) { loseResponse = false; throw new ClientResponseError({ status: 0 }) }
		return { item, operation, sync_epoch: generation, replayed: false } as T
	}
	return { records, writes, request, rotate: () => { generation = 'b'.repeat(32) }, loseNextResponse: () => { loseResponse = true }, before: (fn: () => Promise<void>) => { beforeWrite = fn } }
}

describe('unlocked workspace persistence', () => {
	it('retains a failing sync page until every decryption settles and retries it without loss', async () => {
		const api = server(), key = randomKey()
		const writer = new WorkspaceSession('owner', key, epoch, api.request)
		writer.create(); const damaged = writer.create(); await writer.flush()
		const original = api.records.get(damaged)!
		api.records.set(damaged, { ...original, protocol_version: 99 })
		const reader = new WorkspaceSession('owner', key, epoch, api.request)
		await reader.load()
		expect(reader.getSnapshot().loaded).toBe(false)
		expect(reader.getSnapshot().error).not.toBe('')
		api.records.set(damaged, original)
		await reader.load()
		expect(reader.getSnapshot().loaded).toBe(true)
		expect(reader.getSnapshot().notes).toHaveLength(2)
		expect(reader.getSnapshot().error).toBe('')
		writer.dispose(); reader.dispose()
	})
	it('does not repopulate a locked session after an in-flight sync returns', async () => {
		const api = server(), key = randomKey()
		const writer = new WorkspaceSession('owner', key, epoch, api.request)
		writer.create(); await writer.flush()
		let release!: () => void
		const blocked = new Promise<void>(resolve => { release = resolve })
		const delayed = async <T>(path: string, method = 'GET', body?: unknown, generation?: string) => { await blocked; return api.request<T>(path, method, body, generation) }
		const reader = new WorkspaceSession('owner', key, epoch, delayed)
		const loading = reader.load()
		await Promise.resolve(); reader.dispose(); release(); await loading
		expect(reader.getSnapshot().notes).toEqual([])
		expect(reader.getSnapshot().loaded).toBe(false)
		writer.dispose()
	})
	it('confirms an old receipt without overwriting newer remote content', async () => {
		const api = server(), key = randomKey()
		const a = new WorkspaceSession('owner', key, epoch, api.request), b = new WorkspaceSession('owner', key, epoch, api.request)
		const id = a.create()
		api.loseNextResponse(); await a.flush()
		await b.load(); b.edit(id, { body: 'newer remote text' }); await b.flush()
		await a.flush()
		expect(a.getSnapshot().notes[0].content.body).toBe('newer remote text')
		expect(a.getSnapshot().unsaved).toBe(false)
		a.dispose(); b.dispose()
	})
	it('keeps later local edits when a replay returns a newer remote revision', async () => {
		const api = server(), key = randomKey()
		const a = new WorkspaceSession('owner', key, epoch, api.request), b = new WorkspaceSession('owner', key, epoch, api.request)
		const id = a.create(); api.loseNextResponse(); await a.flush()
		await b.load(); b.edit(id, { body: 'remote' }); await b.flush()
		a.edit(id, { body: 'local' }); await a.flush()
		expect(a.getSnapshot().notes[0].content.body).toBe('local')
		expect(a.getSnapshot().notes[0].conflict?.revision).toBe(2)
		a.dispose(); b.dispose()
	})
	it('retries deletion with the same operation ID after losing its response', async () => {
		const api = server(), session = new WorkspaceSession('owner', randomKey(), epoch, api.request)
		const id = session.create(); await session.flush()
		api.loseNextResponse(); await session.remove(id)
		expect(session.getSnapshot().unsaved).toBe(true)
		await session.flush()
		expect(api.writes[2]).toEqual(api.writes[1])
		expect(session.getSnapshot().notes).toEqual([])
		expect(session.getSnapshot().unsaved).toBe(false)
		session.dispose()
	})
	it('freezes old-generation requests while retaining the draft', async () => {
		const api = server(), session = new WorkspaceSession('owner', randomKey(), epoch, api.request)
		const id = session.create(); session.edit(id, { body: 'keep this' }); api.rotate()
		await session.flush(); await session.sync()
		expect(session.getSnapshot().resetRequired).toBe(true)
		expect(session.getSnapshot().notes[0].content.body).toBe('keep this')
		expect(api.writes).toHaveLength(0)
		session.dispose()
	})
	it('preserves attachment references on text edits and rejects tampered references', async () => {
		const api = server(), key = randomKey(), session = new WorkspaceSession('owner', key, epoch, api.request)
		const id = session.create()
		const attachment = { id: crypto.randomUUID(), name: 'test.txt', media_type: 'text/plain', size: 1, nonce: 'AAAAAAAAAAAAAAAA', sha256: 'a'.repeat(64) }
		session.edit(id, { attachments: [attachment] }); await session.flush()
		session.edit(id, { body: 'updated' }); await session.flush()
		expect(api.writes[1].attachment_ids).toEqual([attachment.id])
		await expect(decryptNote(key, 'owner', { ...api.records.get(id)!, attachment_ids: [] })).rejects.toThrow('附件清单')
		session.dispose()
	})
	it('retries the identical envelope after lost acknowledgement, retaining later edits', async () => {
		const api = server(), key = randomKey(), session = new WorkspaceSession('owner', key, epoch, api.request)
		await session.load()
		const id = session.create()
		session.edit(id, { body: 'first' })
		api.loseNextResponse()
		await session.flush()
		expect(session.getSnapshot().error).not.toBe('')
		session.edit(id, { body: 'second' })
		await session.flush()
		expect(api.writes[1]).toEqual(api.writes[0])
		expect(session.getSnapshot().notes[0].dirty).toBe(true)
		await session.flush()
		expect((await decryptNote(key, 'owner', api.records.get(id)!)).body).toBe('second')
		expect(session.getSnapshot().notes[0].revision).toBe(2)
		expect(session.getSnapshot().notes[0].dirty).toBe(false)
		session.dispose()
	})
	it('keeps concurrent edits as an explicit conflict, and can preserve a local copy', async () => {
		const api = server(), key = randomKey()
		const a = new WorkspaceSession('owner', key, epoch, api.request), b = new WorkspaceSession('owner', key, epoch, api.request)
		const id = a.create()
		await a.flush(); await b.load()
		a.edit(id, { body: 'device A' }); b.edit(id, { body: 'device B' })
		await a.flush(); await b.flush()
		expect(b.getSnapshot().notes[0].content.body).toBe('device B')
		expect(b.getSnapshot().notes[0].conflict?.revision).toBe(2)
		await b.resolve(id, true); await b.flush()
		expect(b.getSnapshot().notes).toHaveLength(2)
		expect(b.getSnapshot().notes.find(note => note.id === id)?.content.body).toBe('device A')
		expect(b.getSnapshot().notes.find(note => note.id !== id)?.content.body).toBe('device B')
		a.dispose(); b.dispose()
	})
	it('preserves edits typed while an earlier save is in flight', async () => {
		const api = server(), session = new WorkspaceSession('owner', randomKey(), epoch, api.request)
		let entered!: () => void, release!: () => void
		const waiting = new Promise<void>(resolve => { entered = resolve })
		const blocked = new Promise<void>(resolve => { release = resolve })
		api.before(async () => { entered(); await blocked })
		const id = session.create()
		const saving = session.flush()
		await waiting
		session.edit(id, { title: 'typed during request' })
		release(); await saving
		expect(session.getSnapshot().notes[0].dirty).toBe(true)
		await session.flush()
		expect(session.getSnapshot().notes[0].dirty).toBe(false)
		session.dispose()
	})
	it('does not resurrect plaintext after a locked in-flight session returns', async () => {
		const api = server(), session = new WorkspaceSession('owner', randomKey(), epoch, api.request)
		let entered!: () => void, release!: () => void
		const waiting = new Promise<void>(resolve => { entered = resolve })
		const blocked = new Promise<void>(resolve => { release = resolve })
		api.before(async () => { entered(); await blocked })
		session.create()
		const saving = session.flush()
		await waiting; session.dispose(); release(); await saving
		expect(session.getSnapshot().notes).toEqual([])
		expect(() => session.create()).toThrow('已锁定')
	})
	it('syncs permanent deletion and keeps a dirty local draft as a conflict', async () => {
		const api = server(), key = randomKey()
		const a = new WorkspaceSession('owner', key, epoch, api.request), b = new WorkspaceSession('owner', key, epoch, api.request)
		const id = a.create(); await a.flush(); await b.load()
		b.edit(id, { title: 'local draft' })
		await a.remove(id); await b.load()
		expect(b.getSnapshot().notes[0].conflict?.deleted).toBe(true)
		expect(b.getSnapshot().notes[0].content.title).toBe('local draft')
		a.dispose(); b.dispose()
	})
})
