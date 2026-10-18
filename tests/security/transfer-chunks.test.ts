import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestTransferChunk, runTransferChunks } from '../../src/lib/transfer-chunks'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}

afterEach(() => vi.useRealTimers())

describe('public relay chunk scheduling', () => {
  it('keeps at most four uploads active and refills a free slot without waiting for earlier chunks', async () => {
    const gates = Array.from({ length: 9 }, () => deferred<void>())
    const started: number[] = []
    let active = 0
    let peak = 0
    const run = runTransferChunks(gates.map((_, i) => i), async index => {
      started.push(index)
      peak = Math.max(peak, ++active)
      await gates[index].promise
      active--
    })
    expect(started).toEqual([0, 1, 2, 3])
    gates[2].resolve()
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3, 4]))
    gates.forEach(gate => gate.resolve())
    await run
    expect(started).toEqual(gates.map((_, i) => i))
    expect(peak).toBe(4)
    expect(active).toBe(0)
  })

  it('bounds prefetched results behind both a slow first chunk and a slow disk write', async () => {
    const gates = Array.from({ length: 8 }, () => deferred<number>())
    const disk = deferred<void>()
    const started: number[] = []
    const loaded: number[] = []
    const written: number[] = []
    const run = runTransferChunks(gates.map((_, i) => i), async index => {
      started.push(index)
      const value = await gates[index].promise
      loaded.push(index)
      return value
    }, {
      async consume(value) {
        written.push(value)
        if (value === 0) await disk.promise
      }
    })
    for (const index of [3, 2, 1]) gates[index].resolve(index)
    await vi.waitFor(() => expect(loaded).toHaveLength(3))
    expect(started).toEqual([0, 1, 2, 3])
    expect(written).toEqual([])
    gates[0].resolve(0)
    await vi.waitFor(() => expect(written).toEqual([0]))
    expect(started).toEqual([0, 1, 2, 3])
    disk.resolve()
    gates.forEach((gate, index) => gate.resolve(index))
    await run
    expect(written).toEqual(gates.map((_, i) => i))
  })

  it('aborts peers on a prefetched failure and waits for pending work before returning the original error', async () => {
    const drain = deferred<void>()
    const failure = new Error('chunk failed')
    const aborted: number[] = []
    const consume = vi.fn()
    const settled = vi.fn()
    const run = runTransferChunks([0, 1, 2, 3, 4], async (index, signal) => {
      if (index === 2) throw failure
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => {
        aborted.push(index)
        if (index === 0) void drain.promise.then(() => reject(signal.reason))
        else reject(signal.reason)
      }, { once: true }))
    }, { consume })
    const observed = run.catch(settled)
    await vi.waitFor(() => expect(aborted).toHaveLength(3))
    expect(settled).not.toHaveBeenCalled()
    expect(consume).not.toHaveBeenCalled()
    drain.resolve()
    await observed
    expect(settled).toHaveBeenCalledExactlyOnceWith(failure)
  })
})

describe('public relay chunk retries', () => {
  it('retries only the current URL, honors Retry-After and includes failures while reading the response body', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const interrupted = new Response(new Uint8Array([1]))
    vi.spyOn(interrupted, 'arrayBuffer').mockRejectedValue(new TypeError('connection reset'))
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(interrupted)
      .mockResolvedValueOnce(new Response(new Uint8Array([7])))
    vi.stubGlobal('fetch', fetcher)
    const run = requestTransferChunk('/signed/chunk', {}, response => response.arrayBuffer(), new AbortController().signal, 'failed')
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(new Uint8Array(await run)).toEqual(new Uint8Array([7]))
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(Array(3).fill('/signed/chunk'))
  })

  it.each([400, 401, 403, 404])('does not retry permanent HTTP %i errors', async status => {
    const fetcher = vi.fn(async () => new Response(null, { status }))
    vi.stubGlobal('fetch', fetcher)
    await expect(requestTransferChunk('/chunk', {}, response => response.arrayBuffer(), new AbortController().signal, 'failed')).rejects.toThrow('failed')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('stops after two retries instead of looping indefinitely', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(async () => new Response(null, { status: 502 }))
    vi.stubGlobal('fetch', fetcher)
    const result = expect(requestTransferChunk('/chunk', {}, response => response.arrayBuffer(), new AbortController().signal, 'failed')).rejects.toThrow('failed')
    await vi.runAllTimersAsync()
    await result
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('cancels a retry backoff without issuing another request', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(async () => new Response(null, { status: 429, headers: { 'Retry-After': '10' } }))
    vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController()
    const result = expect(requestTransferChunk('/chunk', {}, response => response.arrayBuffer(), controller.signal, 'failed')).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await result
    await vi.runAllTimersAsync()
    expect(fetcher).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops when the server requests a cooldown beyond the retry budget', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 503, headers: { 'Retry-After': '60' } }))
    vi.stubGlobal('fetch', fetcher)
    await expect(requestTransferChunk('/chunk', {}, response => response.arrayBuffer(), new AbortController().signal, 'failed')).rejects.toThrow('failed')
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
