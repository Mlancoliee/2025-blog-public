export type WrappedKeys = {
	kdf_salt: string
	wrap_nonce: string
	wrapped_data_key: string
	recovery_wrap_nonce: string
	recovery_wrapped_data_key: string
}

export type StackAccount = Omit<WrappedKeys, 'kdf_salt'> & {
	protocol_version: number
	key_revision: number
	kdf: { name: string; salt: string; memory_kib: number; iterations: number; parallelism: number }
	sync_head: number
	sync_epoch: string
	used_bytes: number
	item_count: number
}

export type Envelope = {
	item_id: string
	protocol_version: number
	revision: number
	change_sequence: number
	nonce: string
	ciphertext: string
	deleted: boolean
	attachment_ids: string[]
	created: string
	updated: string
}

// This entire object is encrypted, including organization and trash state.
export type NoteContent = {
	schema: 1
	kind: 'note'
	format: 'markdown'
	folder_id: string | null
	attachments: Attachment[]
	title: string
	body: string
	tags: string[]
	favorite: boolean
	trashed: boolean
}

export type Attachment = { id: string; name: string; media_type: string; size: number; nonce: string; sha256: string }
export type Bootstrap = {
	state: 'active' | 'empty' | 'deleting'
	account: StackAccount | null
	protocol: { version: number }
	capabilities: Record<string, boolean>
}
export type WriteResult = {
	sync_epoch: string
	item: Envelope
	operation: { operation_id: string; item_id: string; revision: number; change_sequence: number; deleted: boolean; expires: number }
	replayed: boolean
}

export type APIKeyInfo = { id: string; name: string; prefix: string; expires: number; created: string; scope: 'items:read' }
