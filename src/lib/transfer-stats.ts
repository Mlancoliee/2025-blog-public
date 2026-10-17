import type { TransferStatsResponse, TransferStatsSnapshot } from './transfer-types'

export function mergeTransferStats(previous: TransferStatsSnapshot | null, page: TransferStatsResponse, topLimit: number): TransferStatsSnapshot {
	const byType = { ...previous?.byType }
	for (const [type, item] of Object.entries(page.byType)) {
		const key = type as keyof typeof byType
		const current = byType[key]
		byType[key] = { count: (current?.count || 0) + item.count, bytes: (current?.bytes || 0) + item.bytes }
	}
	const metadataErrorCount = (previous?.metadataErrorCount || 0) + page.metadataErrorCount
	return {
		ok: true,
		generatedAt: page.generatedAt,
		store: page.store,
		objectCount: (previous?.objectCount || 0) + page.objectCount,
		totalBytes: (previous?.totalBytes || 0) + page.totalBytes,
		byType,
		metadataErrorCount,
		errors: [...(previous?.errors || []), ...page.errors].slice(0, 200),
		top: [...(previous?.top || []), ...page.top].sort((a, b) => b.bytes - a.bytes).slice(0, topLimit),
		complete: !page.cursor && metadataErrorCount === 0
	}
}
