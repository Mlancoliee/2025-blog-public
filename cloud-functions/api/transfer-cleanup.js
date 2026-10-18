import { getStore } from '@edgeone/pages-blob'
import { cleanupTransferStore } from '../../edge-functions/api/transfer/cleanup.js'

function json(body, status) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export async function onRequest({ request, env = {} }) {
	if (request.method !== 'POST') return json({ error: 'method_not_allowed', message: 'Use POST' }, 405)
	// Retain the existing daily scheduler's Beijing 02:00–02:59 access window.
	if (new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCHours() !== 2) return json({ error: 'forbidden', message: 'Scheduled cleanup runs during Beijing 02:00–02:59 only' }, 403)
	const deadline = Date.now() + 100_000
	try {
		const store = getStore({ name: env.EDGEONE_BLOB_STORE || 'message-transfer', consistency: 'strong' })
		const result = await cleanupTransferStore(store, deadline)
		return json(result, result.complete ? 200 : 503)
	} catch (error) {
		return json({ error: 'cleanup_failed', message: error instanceof Error ? error.message : 'Cleanup failed', complete: false }, 503)
	}
}
