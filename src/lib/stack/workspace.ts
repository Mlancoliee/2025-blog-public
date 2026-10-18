import { ClientResponseError } from 'pocketbase'
import { stackError, stackRequest } from './api'
import { attachmentIDs, decryptNote, encryptNote, importDataKey } from './crypto'
import type { Envelope, NoteContent, WriteResult } from './types'

export type Note = {
	id: string; content: NoteContent; revision: number; updated: string
	dirty: boolean; conflict?: Envelope
}
type Operation = { operation_id: string; base_revision: number }
type Write = { body: Awaited<ReturnType<typeof encryptNote>> & Operation & { item_id: string; attachment_ids: string[] }; content: NoteContent }
type Snapshot = { notes: Note[]; busy: boolean; loaded: boolean; error: string; syncedAt: number; unsaved: boolean; resetRequired: boolean }
export type Transport = <T>(path: string, method?: string, body?: unknown, epoch?: string) => Promise<T>

// A single unlocked session owns plaintext and serializes network operations.
// Nothing here is persisted in localStorage/IndexedDB or sent to Next.js.
export class WorkspaceSession {
	private notes = new Map<string, Note>()
	private notesChanged = false
	private pending = new Map<string, Write>()
	private deletions = new Map<string, Operation>()
	private listeners = new Set<() => void>()
	private snapshot: Snapshot = { notes: [], busy: false, loaded: false, error: '', syncedAt: 0, unsaved: false, resetRequired: false }
	private queue = Promise.resolve()
	private cursor = 0
	private disposed = false
	private controller = new AbortController()
	private key: Promise<CryptoKey> | null
	private request: Transport

	constructor(readonly owner: string, key: Uint8Array, readonly epoch: string, request?: Transport) {
		if (!/^[A-Za-z0-9]{32}$/.test(epoch)) throw new Error('空间代际无效，请重新连接。')
		this.key = importDataKey(key)
		this.request = request ?? ((path, method, body, generation) => stackRequest(owner, path, method, body, this.controller.signal, generation))
	}
	getSnapshot = () => this.snapshot
	subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
	private setNote(id: string, note: Note) { this.notes.set(id, note); this.notesChanged = true }
	private deleteNote(id: string) { this.notes.delete(id); this.notesChanged = true }
	private emit(patch: Partial<Snapshot> = {}) {
		if (this.disposed) return
		const notes = this.notesChanged ? [...this.notes.values()] : this.snapshot.notes
		this.notesChanged = false
		this.snapshot = { ...this.snapshot, ...patch, notes, unsaved: notes.some(note => note.dirty) || this.pending.size > 0 || this.deletions.size > 0 }
		this.listeners.forEach(listener => listener())
	}
	private active() { if (this.disposed) throw new Error('空间已锁定。') }
	private run(action: () => Promise<void>) {
		const task = this.queue.then(async () => {
			if (this.disposed || this.snapshot.resetRequired) return
			this.emit({ busy: true, error: '' })
			try { await action() } catch (error) {
				const reset = error instanceof ClientResponseError && ['sync_reset_required', 'not_initialized'].includes(error.response?.error?.code)
				this.emit({ error: stackError(error), resetRequired: this.snapshot.resetRequired || reset })
			}
			finally { this.emit({ busy: false }) }
		})
		this.queue = task
		return task
	}
	create(content?: NoteContent) {
		this.active()
		const id = crypto.randomUUID()
		if (this.snapshot.resetRequired) throw new Error('请重新解锁空间。')
		if (content?.attachments.length) throw new Error('附件绑定原笔记，请先导出正文或处理原笔记冲突，不能直接复制附件引用。')
		this.setNote(id, { id, content: content ?? { schema: 1, kind: 'note', format: 'markdown', folder_id: null, attachments: [], title: '', body: '', tags: [], favorite: false, trashed: false }, revision: 0, updated: new Date().toISOString(), dirty: true })
		this.emit({ error: '' })
		return id
	}
	edit(id: string, patch: Partial<NoteContent>) {
		this.active()
		const note = this.notes.get(id)
		if (!note) return
		this.setNote(id, { ...note, content: { ...note.content, ...patch }, dirty: true, updated: new Date().toISOString() })
		this.emit()
	}

	private async apply(item: Envelope) {
		this.active()
		let note = this.notes.get(item.item_id)
		if (note && item.revision <= note.revision) return
		if (note?.dirty) {
			this.setNote(note.id, { ...note, conflict: item })
			return
		}
		const content = item.deleted ? null : await decryptNote(await this.key!, this.owner, item)
		this.active()
		// Typing may continue while WebCrypto is awaiting decryption.
		note = this.notes.get(item.item_id)
		if (note?.dirty) this.setNote(note.id, { ...note, conflict: item })
		else if (content) this.setNote(item.item_id, { id: item.item_id, content, revision: item.revision, updated: item.updated, dirty: false })
		else this.deleteNote(item.item_id)
	}
	private async pull() {
		let more = true
		while (more) {
			this.active()
			const page = await this.request<{ owner_id: string; sync_epoch: string; items: Envelope[]; next_cursor: number; has_more: boolean }>(`/sync?since=${this.cursor}&limit=100`, 'GET', undefined, this.epoch)
			this.active()
			this.checkEpoch(page.sync_epoch)
			// Session identity supplies AAD; never take an owner from server data.
			if (page.owner_id !== this.owner || !Number.isSafeInteger(page.next_cursor) || page.next_cursor < this.cursor || (page.has_more && page.next_cursor <= this.cursor)) throw new Error('同步响应不正确，已停止读取。')
			// Bound concurrency to one server page; finish it before advancing or reporting an error.
			const results = await Promise.allSettled(page.items.map(item => this.apply(item)))
			const failed = results.find(result => result.status === 'rejected')
			if (failed?.status === 'rejected') throw failed.reason
			this.cursor = page.next_cursor
			more = page.has_more
		}
		this.emit({ loaded: true, syncedAt: Date.now() })
	}
	load = () => this.run(() => this.pull())

	private checkEpoch(epoch: string) {
		if (epoch !== this.epoch) throw new ClientResponseError({ status: 409, response: { error: { code: 'sync_reset_required' } } })
	}
	private receipt(result: WriteResult, id: string, body: Operation, deleted: boolean) {
		this.active()
		this.checkEpoch(result.sync_epoch)
		const op = result.operation
		if (!op || op.operation_id !== body.operation_id || op.item_id !== id || op.revision !== body.base_revision + 1 || op.deleted !== deleted || result.item.item_id !== id || result.item.revision < op.revision) throw new Error('保存回执不正确，原请求已保留，请重试。')
	}

	private async save(id: string) {
		this.active()
		const note = this.notes.get(id)
		if (!note?.dirty || note.conflict || this.deletions.has(id)) return
		let write = this.pending.get(id)
		if (!write) {
			const encrypted = await encryptNote(await this.key!, this.owner, id, note.revision + 1, note.content)
			this.active()
			write = { body: { ...encrypted, operation_id: crypto.randomUUID(), item_id: id, base_revision: note.revision, attachment_ids: attachmentIDs(note.content) }, content: note.content }
			this.pending.set(id, write)
		}
		try {
			const result = await this.request<WriteResult>(write.body.base_revision ? `/items/${id}` : '/items', write.body.base_revision ? 'PUT' : 'POST', write.body, this.epoch)
			this.receipt(result, id, write.body, false)
			const { item, operation } = result
			if (item.revision === operation.revision && (item.deleted || item.nonce !== write.body.nonce || item.ciphertext !== write.body.ciphertext || JSON.stringify([...item.attachment_ids].sort()) !== JSON.stringify(write.body.attachment_ids))) throw new Error('保存结果与原请求不一致，原请求已保留。')
			const latest = this.notes.get(id)
			if (latest) this.setNote(id, { ...latest, revision: operation.revision, dirty: latest.content !== write.content, updated: latest.content === write.content ? item.updated : latest.updated })
			this.pending.delete(id)
			await this.apply(item)
			this.emit()
		} catch (error) {
			if (error instanceof ClientResponseError && error.status === 409 && error.response.current) {
				this.active()
				const latest = this.notes.get(id)
				if (latest) this.setNote(id, { ...latest, conflict: error.response.current })
				this.pending.delete(id)
				this.emit()
				return
			}
			// Retry the exact envelope after uncertain delivery; never re-encrypt it.
			if (error instanceof ClientResponseError && [400, 403, 413].includes(error.status)) this.pending.delete(id)
			throw error
		}
	}
	private async saveAll() {
		for (const id of [...this.deletions.keys()]) await this.finishDelete(id)
		for (const id of [...this.notes.keys()]) await this.save(id)
	}
	flush = () => this.run(() => this.saveAll())
	sync = () => this.run(async () => { await this.saveAll(); await this.pull() })

	// The user can explicitly discard local edits, or keep them as a new note.
	resolve(id: string, keepCopy: boolean) {
		return this.run(async () => {
			const note = this.notes.get(id)
			if (!note?.conflict) return
			const remote = note.conflict
			const content = remote.deleted ? null : await decryptNote(await this.key!, this.owner, remote)
			this.active()
			const latest = this.notes.get(id)!
			if (keepCopy) this.create({ ...latest.content, attachments: [], title: `${latest.content.title || '未命名笔记'} · 本地副本`, trashed: false })
			this.pending.delete(id)
			if (content) this.setNote(id, { id, content, revision: remote.revision, updated: remote.updated, dirty: false })
			else this.deleteNote(id)
			this.emit()
		})
	}
	remove(id: string) {
		return this.run(async () => {
			if (this.deletions.has(id)) return this.finishDelete(id)
			await this.save(id)
			const note = this.notes.get(id)
			if (!note) return
			if (note.dirty || note.conflict) throw new Error('请先保存笔记并处理冲突，再永久删除。')
			this.deletions.set(id, { operation_id: crypto.randomUUID(), base_revision: note.revision })
			this.emit()
			await this.finishDelete(id)
		})
	}
	private async finishDelete(id: string) {
		const body = this.deletions.get(id)!
		try {
			const result = await this.request<WriteResult>(`/items/${id}`, 'DELETE', body, this.epoch)
			this.receipt(result, id, body, true)
			if (!result.item.deleted) throw new Error('删除结果不正确，原请求已保留。')
			this.deletions.delete(id)
			await this.apply(result.item)
			this.emit()
		} catch (error) {
			if (error instanceof ClientResponseError && error.status === 409 && error.response.current) {
				this.deletions.delete(id)
				await this.apply(error.response.current)
				this.emit()
				throw new Error('笔记已在其他设备修改，请查看后再决定是否删除。')
			}
			throw error
		}
	}
	dispose() {
		this.disposed = true
		this.controller.abort()
		this.key = null
		this.notes.clear(); this.pending.clear(); this.deletions.clear(); this.listeners.clear()
		this.snapshot = { notes: [], busy: false, loaded: false, error: '', syncedAt: 0, unsaved: false, resetRequired: false }
	}
}
