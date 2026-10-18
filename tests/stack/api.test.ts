import { expect, it } from 'vitest'
import { checkBootstrap } from '@/lib/stack/api'
import type { Bootstrap } from '@/lib/stack/types'

it('accepts current space states and rejects old or inconsistent bootstrap contracts', () => {
	const data: Bootstrap = { state: 'empty', account: null, protocol: { version: 1 }, capabilities: { operation_receipts: true, sync_epochs: true, encrypted_attachments: true, read_only_api_keys: true } }
	expect(checkBootstrap(data).state).toBe('empty')
	expect(checkBootstrap({ ...data, state: 'deleting' }).state).toBe('deleting')
	expect(() => checkBootstrap({ ...data, capabilities: {} })).toThrow('服务端版本')
	expect(() => checkBootstrap({ ...data, state: 'active' })).toThrow('服务端版本')
})
