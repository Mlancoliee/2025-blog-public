import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { TransferCleanupResponse } from '../../src/lib/transfer-types'

const modulePath = resolve(process.cwd(), 'edge-functions/api/transfer/cleanup.js')
type CleanupStore = { list: (options: { prefix: string; limit: number; cursor?: string; paginate: boolean }) => Promise<{ blobs: Array<{ key: string }>; cursor?: string }>; delete: (key: string) => Promise<void> }
type CleanupModule = {
	cleanupTransferPage: (store: CleanupStore, cursor: string | null) => Promise<TransferCleanupResponse>
	cleanupTransferStore: (store: CleanupStore, deadline: number) => Promise<TransferCleanupResponse & { message?: string }>
}

function fixture(count: number) {
	const keys = Array.from({ length: count }, (_, index) => `transfer/items/example/chunks/part-${String(index).padStart(5, '0')}.bin`)
	const remaining = new Set([...keys, 'another-feature/keep.json'])
	const failures = new Set<string>()
	const requests: Array<{ count: number; active: number; maxActive: number }> = []
	const markerPrefix = 'tenant/project/message-transfer/'
	function store(budget = 64): CleanupStore {
		const request = { count: 1, active: 0, maxActive: 0 }
		requests.push(request)
		const fetchOnce = () => {
			if (++request.count > budget) throw new Error('Edge fetch budget exceeded')
		}
		return {
			list: async options => {
				fetchOnce()
				const after = options.cursor?.slice(markerPrefix.length) || ''
				const page = [...remaining].filter(key => key.startsWith(options.prefix) && key > after).sort().slice(0, options.limit)
				return { blobs: page.map(key => ({ key })), cursor: page.length === options.limit ? markerPrefix + page.at(-1) : undefined }
			},
			delete: async key => {
				fetchOnce()
				request.maxActive = Math.max(request.maxActive, ++request.active)
				await Promise.resolve()
				request.active--
				if (failures.has(key)) throw new Error('PagesBlob: COS returned 502')
				remaining.delete(key)
			}
		}
	}
	return { keys, remaining, failures, requests, store }
}

describe.skipIf(!existsSync(modulePath))('transfer cleanup pagination', () => {
	async function subject() {
		return (await import(pathToFileURL(modulePath).href)) as CleanupModule
	}

	it('deletes all 133 objects across independent requests without skipping deleted cursor keys', async () => {
		const { cleanupTransferPage } = await subject()
		const data = fixture(133)
		let cursor: string | null = null
		let cleaned = 0
		do {
			const page = await cleanupTransferPage(data.store(), cursor)
			cleaned += page.cleaned
			cursor = page.cursor
		} while (cursor)
		expect(cleaned).toBe(133)
		expect(data.requests).toHaveLength(7)
		expect(data.requests.every(request => request.count <= 22 && request.maxActive <= 8)).toBe(true)
		expect([...data.remaining]).toEqual(['another-feature/keep.json'])
	})

	it('lets the Node scheduled worker drain more than 64 operations while respecting page size and concurrency', async () => {
		const { cleanupTransferStore } = await subject()
		const data = fixture(133)
		const result = await cleanupTransferStore(data.store(Infinity), Date.now() + 100_000)
		expect(result).toMatchObject({ complete: true, cursor: null, scanned: 133, cleaned: 133, deleteErrorCount: 0 })
		expect(data.requests[0].count).toBeGreaterThan(64)
		expect(data.requests[0].maxActive).toBeLessThanOrEqual(8)
		expect([...data.remaining]).toEqual(['another-feature/keep.json'])
	})

	it('retains earlier failures, continues to later objects, and leaves failed keys available for another cleanup', async () => {
		const { cleanupTransferStore, cleanupTransferPage } = await subject()
		const data = fixture(41)
		data.failures.add(data.keys[0])
		data.failures.add(data.keys[40])
		const result = await cleanupTransferStore(data.store(Infinity), Date.now() + 100_000)
		expect(result).toMatchObject({ complete: false, scanned: 41, cleaned: 39, deleteErrorCount: 2 })
		expect(result.errors.map(error => error.key)).toEqual([data.keys[0], data.keys[40]])
		data.failures.clear()
		expect(await cleanupTransferPage(data.store(), null)).toMatchObject({ complete: true, scanned: 2, cleaned: 2 })
		expect([...data.remaining]).toEqual(['another-feature/keep.json'])
	})

	it('preserves partial progress when a later listing fails', async () => {
		const { cleanupTransferStore } = await subject()
		const data = fixture(41)
		const store = data.store(Infinity)
		const list = store.list
		let pages = 0
		store.list = async options => {
			if (pages++) throw new Error('Listing unavailable')
			return list(options)
		}
		const result = await cleanupTransferStore(store, Date.now() + 100_000)
		expect(result).toMatchObject({ complete: false, scanned: 20, cleaned: 20, message: 'Listing unavailable' })
		expect(result.cursor).toBeTruthy()
		expect(data.remaining.size).toBe(22)
	})

	it('stops before starting another page when the scheduled runtime budget expires', async () => {
		const { cleanupTransferStore } = await subject()
		const data = fixture(41)
		const now = vi.spyOn(Date, 'now').mockReturnValue(100_000).mockReturnValueOnce(0)
		try {
			const result = await cleanupTransferStore(data.store(Infinity), 50_000)
			expect(result).toMatchObject({ complete: false, scanned: 20, cleaned: 20 })
			expect(result.message).toContain('time budget exhausted')
			expect(data.remaining.size).toBe(22)
		} finally {
			now.mockRestore()
		}
	})

	it('handles exact page boundaries and an already empty transfer prefix', async () => {
		const { cleanupTransferStore, cleanupTransferPage } = await subject()
		const data = fixture(40)
		expect(await cleanupTransferStore(data.store(Infinity), Date.now() + 100_000)).toMatchObject({ complete: true, scanned: 40, cleaned: 40 })
		expect(await cleanupTransferPage(data.store(), null)).toMatchObject({ complete: true, cursor: null, scanned: 0, cleaned: 0 })
	})
})
