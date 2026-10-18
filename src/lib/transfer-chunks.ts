const CHUNK_CONCURRENCY = 4
const CHUNK_RETRIES = 2

type ChunkTransferOptions<T, R> = {
	signal?: AbortSignal
	consume?: (result: R, chunk: T, signal: AbortSignal) => void | Promise<void>
}

export async function runTransferChunks<T, R>(chunks: readonly T[], transfer: (chunk: T, signal: AbortSignal) => Promise<R>, options: ChunkTransferOptions<T, R> = {}) {
	const controller = new AbortController()
	const { signal } = controller
	const pending = new Set<Promise<unknown>>()
	const abort = () => controller.abort(options.signal?.reason)
	options.signal?.addEventListener('abort', abort, { once: true })
	if (options.signal?.aborted) abort()

	function track<V>(task: Promise<V>) {
		const guarded = task.catch(error => {
			controller.abort(error)
			throw error
		})
		pending.add(guarded)
		// Handle prefetched failures immediately, even while an earlier chunk is pending.
		void guarded.then(() => pending.delete(guarded), () => pending.delete(guarded))
		return guarded
	}

	async function transferAt(index: number) {
		signal.throwIfAborted()
		return transfer(chunks[index], signal)
	}

	try {
		signal.throwIfAborted()
		const count = Math.min(CHUNK_CONCURRENCY, chunks.length)
		if (options.consume) {
			const ready = new Map<number, Promise<R>>()
			for (let index = 0; index < count; index++) ready.set(index, track(transferAt(index)))
			for (let index = 0; index < chunks.length; index++) {
				const result = await ready.get(index)!
				signal.throwIfAborted()
				await options.consume(result, chunks[index], signal)
				signal.throwIfAborted()
				ready.delete(index)
				// Refill only after consumption so slow writes cannot accumulate a whole file.
				const next = index + count
				if (next < chunks.length) ready.set(next, track(transferAt(next)))
			}
		} else {
			let next = 0
			const worker = async () => {
				while (next < chunks.length) await transferAt(next++)
			}
			await Promise.all(Array.from({ length: count }, () => track(worker())))
		}
	} catch (error) {
		controller.abort(error)
		throw signal.reason
	} finally {
		await Promise.allSettled(pending)
		options.signal?.removeEventListener('abort', abort)
	}
	signal.throwIfAborted()
}

class ChunkResponseError extends Error {
	constructor(readonly status: number, readonly retryAfter: string | null) {
		super(`HTTP ${status}`)
	}
}

function retryAfterMs(value: string | null) {
	if (!value) return 0
	const seconds = Number(value)
	return Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now() || 0)
}

function waitForRetry(delay: number, signal: AbortSignal) {
	signal.throwIfAborted()
	return new Promise<void>((resolve, reject) => {
		const abort = () => {
			clearTimeout(timer)
			reject(signal.reason)
		}
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', abort)
			resolve()
		}, delay)
		signal.addEventListener('abort', abort, { once: true })
	})
}

export async function requestTransferChunk<R>(url: string, init: RequestInit, read: (response: Response) => Promise<R>, signal: AbortSignal, message: string): Promise<R> {
	for (let attempt = 0; ; attempt++) {
		signal.throwIfAborted()
		let response: Response | undefined
		let delay = 0
		try {
			response = await fetch(url, { ...init, signal })
			if (!response.ok) throw new ChunkResponseError(response.status, response.headers.get('Retry-After'))
			const result = await read(response)
			signal.throwIfAborted()
			return result
		} catch (error) {
			signal.throwIfAborted()
			const transient = error instanceof TypeError || (error instanceof ChunkResponseError && (error.status === 408 || error.status === 429 || error.status >= 500))
			if (!transient || attempt >= CHUNK_RETRIES) throw new Error(message, { cause: error })
			delay = Math.max(500 * 2 ** attempt + Math.random() * 250, error instanceof ChunkResponseError ? retryAfterMs(error.retryAfter) : 0)
			// Respect longer server cooldowns by stopping instead of retrying too early.
			if (delay > 30_000) throw new Error(message, { cause: error })
		} finally {
			if (response && !response.bodyUsed) await response.body?.cancel().catch(() => {})
		}
		await waitForRetry(delay, signal)
	}
}
