import { describe, expect, it, vi } from 'vitest'
import { createRelayDownloadStorage } from '../../src/lib/transfer-download-storage'

function setup() {
  const writes: Uint8Array[] = []
  const writer = {
    write: vi.fn(async (bytes: Uint8Array) => { writes.push(bytes.slice()) }),
    close: vi.fn(async () => {}),
    abort: vi.fn(async () => {})
  }
  const directory = {
    async *[Symbol.asyncIterator](): AsyncGenerator<[string, object]> {},
    getFileHandle: vi.fn(async () => ({
      createWritable: vi.fn(async () => writer),
      getFile: vi.fn(async () => new Blob(writes as BlobPart[]))
    })),
    removeEntry: vi.fn(async (_name: string) => {})
  }
  const storage = {
    getDirectory: vi.fn(async () => ({ getDirectoryHandle: vi.fn(async () => directory) })),
    estimate: vi.fn(async () => ({ quota: 1024, usage: 0 }))
  }
  vi.stubGlobal('navigator', { storage })
  return { writes, writer, directory, storage }
}

describe('public relay disk downloads', () => {
  it('writes only the supplied byte ranges, closes before reading, and releases the temporary file', async () => {
    const { writer, directory } = setup()
    const sink = await createRelayDownloadStorage(4)
    await sink.write(new Uint8Array([99, 1, 2, 99]).subarray(1, 3))
    await sink.write(new Uint8Array([3, 4]))
    const file = await sink.finish('application/x-transfer')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(file.type).toBe('application/x-transfer')
    expect(writer.close).toHaveBeenCalledOnce()
    expect(directory.removeEntry).not.toHaveBeenCalled()
    await sink.dispose()
    await sink.dispose()
    expect(writer.abort).not.toHaveBeenCalled()
    expect(directory.removeEntry).toHaveBeenCalledOnce()
  })

  it('aborts and removes an incomplete file when disk space runs out', async () => {
    const { writer, directory } = setup()
    writer.write.mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'))
    const sink = await createRelayDownloadStorage(4)
    await expect(sink.write(new Uint8Array([1]))).rejects.toThrow('存储空间不足')
    await sink.dispose()
    expect(writer.abort).toHaveBeenCalledOnce()
    expect(directory.removeEntry).toHaveBeenCalledOnce()
  })

  it('cleans abandoned files before checking quota and preserves recent downloads', async () => {
    const { directory, storage } = setup()
    const stale = `${Date.now() - 48 * 60 * 60 * 1000}-old.part`
    const recent = `${Date.now()}-active.part`
    directory[Symbol.asyncIterator] = async function* () {
      yield [stale, {}]
      yield [recent, {}]
    }
    storage.estimate.mockImplementation(async () => ({ quota: 1024, usage: directory.removeEntry.mock.calls.length ? 0 : 1024 }))
    const sink = await createRelayDownloadStorage(1024)
    expect(directory.removeEntry).toHaveBeenCalledWith(stale)
    expect(directory.removeEntry).not.toHaveBeenCalledWith(recent)
    await sink.dispose()
  })

  it('rejects insufficient quota without opening a file writer', async () => {
    const { storage, directory } = setup()
    storage.estimate.mockResolvedValueOnce({ quota: 1024, usage: 1020 })
    await expect(createRelayDownloadStorage(5)).rejects.toThrow('存储空间不足')
    expect(directory.getFileHandle).not.toHaveBeenCalled()
  })

  it('rejects browsers without OPFS before creating any download data', async () => {
    vi.stubGlobal('navigator', { storage: {} })
    await expect(createRelayDownloadStorage(800 * 1024 * 1024)).rejects.toThrow('不支持接收超过 200MB')
  })
})
