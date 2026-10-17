import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mergeTransferStats } from '../../src/lib/transfer-stats'
import type { TransferStatsResponse, TransferStatsSnapshot } from '../../src/lib/transfer-types'

const modulePath = resolve(process.cwd(), 'edge-functions/api/transfer/admin.js')
type StoredObject = { key: string; bytes: number; failure?: 'upstream' | 'missing' | 'size' }
type StatsInput = { password: string; topLimit: number; cursor: string | null }
type StatsModule = { collectTransferStats: (input: StatsInput, context: unknown) => Promise<TransferStatsResponse> }

function fixture(count: number) {
	const objects: StoredObject[] = Array.from({ length: count }, (_, index) => ({ key: `transfer/items/example/chunks/part-${String(index).padStart(5, '0')}.bin`, bytes: (index + 1) * 1024 }))
	const requests: Array<{ count: number; active: number; maxActive: number; metadata: number }> = []
	const context = {
		env: { TRANSFER_ADMIN_PASSWORD_HASH: 'hash:secret' },
		getRequiredEnv: (env: Record<string, string>, name: string) => env[name],
		sha256: async (value: string) => `hash:${value}`,
		safeEqual: (a: string, b: string) => a === b,
		TransferError: class extends Error {},
		transferStoreName: () => 'message-transfer',
		limits: { statsTopLimit: 50, statsMaxTopLimit: 200, statsMetadataBatchSize: 10 },
		getTransferStore: async () => {
			// A credential exchange consumes one fetch before listing/HEAD requests.
			const request = { count: 1, active: 0, maxActive: 0, metadata: 0 }
			requests.push(request)
			const fetchOnce = () => {
				if (++request.count > 64) throw new Error('Edge Function fetch limit exceeded')
			}
			return {
				list: async (options: { cursor?: string; limit?: number; paginate?: boolean }) => {
					fetchOnce()
					const start = options.cursor ? objects.findIndex(object => object.key === options.cursor) + 1 : 0
					const page = objects.slice(start, start + (options.limit ?? objects.length))
					return { blobs: page.map(object => ({ key: object.key, etag: object.key })), cursor: start + page.length < objects.length ? page.at(-1)?.key : undefined }
				},
				getMetadata: async (key: string) => {
					fetchOnce()
					request.metadata++
					request.maxActive = Math.max(request.maxActive, ++request.active)
					await Promise.resolve()
					request.active--
					const object = objects.find(item => item.key === key)!
					if (object.failure === 'upstream') throw new Error('PagesBlob: COS returned 502')
					if (object.failure === 'missing') return null
					return { headers: { 'content-length': object.failure === 'size' ? 'invalid' : String(object.bytes) }, contentType: 'application/octet-stream', etag: key }
				}
			}
		}
	}
	return { context, objects, requests }
}

async function collectAll(collect: StatsModule['collectTransferStats'], context: unknown, topLimit: number) {
	let cursor: string | null = null
	let snapshot: TransferStatsSnapshot | null = null
	const pages: TransferStatsResponse[] = []
	do {
		const page = await collect({ password: 'secret', topLimit, cursor }, context)
		pages.push(page)
		snapshot = mergeTransferStats(snapshot, page, topLimit)
		cursor = page.cursor
	} while (cursor)
	return { snapshot: snapshot!, pages }
}

describe.skipIf(!existsSync(modulePath))('paginated transfer statistics', () => {
	async function subject() {
		return (await import(pathToFileURL(modulePath).href)) as StatsModule
	}

	it('scans all 121 objects within each invocation budget with a display limit of 200', async () => {
		const { collectTransferStats } = await subject()
		const { context, objects, requests } = fixture(121)
		const { snapshot, pages } = await collectAll(collectTransferStats, context, 200)
		expect(pages).toHaveLength(7)
		expect(requests.every(request => request.count <= 22 && request.metadata <= 20 && request.maxActive <= 8)).toBe(true)
		expect(snapshot).toMatchObject({ complete: true, objectCount: 121, metadataErrorCount: 0, byType: { chunk: { count: 121, bytes: objects.reduce((sum, object) => sum + object.bytes, 0) } } })
		expect(snapshot.totalBytes).toBe(objects.reduce((sum, object) => sum + object.bytes, 0))
		expect(snapshot.top).toHaveLength(121)
		expect(new Set(snapshot.top.map(object => object.key)).size).toBe(121)
	})

	it('uses the display limit only for the global largest objects, including later pages', async () => {
		const { collectTransferStats } = await subject()
		const { context, objects } = fixture(45)
		const { snapshot } = await collectAll(collectTransferStats, context, 1)
		expect(snapshot.objectCount).toBe(45)
		expect(snapshot.totalBytes).toBe(objects.reduce((sum, object) => sum + object.bytes, 0))
		expect(snapshot.top.map(object => object.key)).toEqual([objects[44].key])
	})

	it('retains earlier metadata failures after the last page and when no detail rows are requested', async () => {
		const { collectTransferStats } = await subject()
		const { context, objects } = fixture(21)
		objects[0].failure = 'upstream'
		objects[1].failure = 'missing'
		objects[2].failure = 'size'
		const { snapshot, pages } = await collectAll(collectTransferStats, context, 0)
		expect(pages.at(-1)?.metadataErrorCount).toBe(0)
		expect(snapshot).toMatchObject({ complete: false, objectCount: 21, metadataErrorCount: 3, top: [] })
		expect(snapshot.totalBytes).toBe(objects.slice(3).reduce((sum, object) => sum + object.bytes, 0))
		expect(snapshot.errors.map(error => error.key)).toEqual(objects.slice(0, 3).map(object => object.key))
		expect(mergeTransferStats(null, pages[0], 0).complete).toBe(false)
	})

	it('finishes an empty store with a complete zero total', async () => {
		const { collectTransferStats } = await subject()
		const { context, requests } = fixture(0)
		const { snapshot } = await collectAll(collectTransferStats, context, 200)
		expect(snapshot).toMatchObject({ complete: true, objectCount: 0, totalBytes: 0, metadataErrorCount: 0, top: [] })
		expect(requests).toMatchObject([{ count: 2, metadata: 0 }])
	})
})
