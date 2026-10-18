const PAGE_SIZE = 20
const DELETE_CONCURRENCY = 8

function compactError(error) {
	return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 300)
}

export async function cleanupTransferPage(store, cursor) {
	const page = await store.list({ prefix: 'transfer/', consistency: 'strong', limit: PAGE_SIZE, paginate: false, cursor: cursor || undefined })
	if (page.cursor && page.cursor === cursor) throw new Error('Cleanup cursor did not advance')
	const errors = []
	for (let index = 0; index < page.blobs.length; index += DELETE_CONCURRENCY) {
		const results = await Promise.all(
			page.blobs.slice(index, index + DELETE_CONCURRENCY).map(async blob => {
				try {
					await store.delete(blob.key)
					return null
				} catch (error) {
					return { key: blob.key, message: compactError(error) }
				}
			})
		)
		for (const error of results) if (error) errors.push(error)
	}
	return { ok: true, cursor: page.cursor || null, scanned: page.blobs.length, cleaned: page.blobs.length - errors.length, deleteErrorCount: errors.length, errors, complete: !page.cursor && errors.length === 0 }
}

// Only the Node.js scheduled worker may drain all pages in one invocation.
export async function cleanupTransferStore(store, deadline) {
	const result = { ok: true, cursor: null, scanned: 0, cleaned: 0, deleteErrorCount: 0, errors: [], complete: false }
	try {
		do {
			if (Date.now() >= deadline) throw new Error('Cleanup time budget exhausted; remaining objects require another cleanup')
			const page = await cleanupTransferPage(store, result.cursor)
			result.cursor = page.cursor
			result.scanned += page.scanned
			result.cleaned += page.cleaned
			result.deleteErrorCount += page.deleteErrorCount
			result.errors = [...result.errors, ...page.errors].slice(0, 50)
		} while (result.cursor)
		result.complete = result.deleteErrorCount === 0
		return result
	} catch (error) {
		return { ...result, message: compactError(error) }
	}
}
