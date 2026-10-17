import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRelayTransfer, openRelayTransfer } from '../../src/lib/transfer-relay'
import { createRelayDownloadStorage } from '../../src/lib/transfer-download-storage'
import { TRANSFER_LIMITS, type TransferPublicMeta } from '../../src/lib/transfer-types'

vi.mock('../../src/lib/transfer-download-storage', () => ({ createRelayDownloadStorage: vi.fn() }))
vi.mock('../../src/lib/transfer-crypto', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/lib/transfer-crypto')>(),
  createTransferEncryptionContext: vi.fn(async () => ({ key: {} as CryptoKey, salt: 'salt', proof: 'proof' })),
  deriveTransferProof: vi.fn(async () => ({ key: {} as CryptoKey, proof: 'proof' })),
  decryptTransferChunk: vi.fn(async () => new Uint8Array([1, 2, 3]))
}))

// Exercise a full 800 MiB manifest while mocked crypto keeps the test data small.
const chunks = Array.from({ length: TRANSFER_LIMITS.maxFileBytes / TRANSFER_LIMITS.publicRelayChunkBytes }, (_, index) => ({
  index, iv: `chunk-${index}`, plainSize: TRANSFER_LIMITS.publicRelayChunkBytes, cipherSize: TRANSFER_LIMITS.publicRelayChunkBytes + 16
}))
const meta: TransferPublicMeta = {
  code: 'ABC234', kind: 'file', name: 'large.png', contentType: 'image/png',
  size: TRANSFER_LIMITS.maxFileBytes, salt: 'salt', status: 'ready', expireAt: Date.now() + 3600000,
  createdAt: Date.now(), chunked: true, chunkSize: TRANSFER_LIMITS.publicRelayChunkBytes,
  chunkCount: chunks.length, chunks
}
const options = { code: meta.code, password: 'password', metaUrl: '/meta', openUrl: '/open' }

function setup() {
  const events: string[] = []
  const storage = {
    write: vi.fn(async (_bytes: Uint8Array) => {}),
    finish: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])])),
    dispose: vi.fn(async () => {})
  }
  vi.mocked(createRelayDownloadStorage).mockImplementation(async () => { events.push('storage'); return storage })
  const fetcher = vi.fn(async (url: string) => {
    if (url === '/meta') return Response.json(meta)
    events.push(url)
    if (url === '/open') return Response.json({ ...meta, chunks: chunks.map(chunk => ({ ...chunk, url: `/chunk/${chunk.index}` })) })
    return new Response(new Uint8Array([0]))
  })
  vi.stubGlobal('fetch', fetcher)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:relay-test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  return { events, storage, fetcher }
}

beforeEach(() => vi.mocked(createRelayDownloadStorage).mockReset())

describe('public relay large-file receive lifecycle', () => {
  it('accepts an 800 MiB file and creates a 200-chunk manifest without reading the entire file', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => { throw new Error('creation reached') })
    vi.stubGlobal('fetch', fetcher)
    const file = { name: 'large.bin', type: 'application/octet-stream', size: 800 * 1024 * 1024, slice: vi.fn() } as unknown as File
    await expect(createRelayTransfer({ kind: 'file', text: '', file, password: 'password', createUrl: '/create', completeUrl: '/complete' })).rejects.toThrow('creation reached')
    const manifest = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(manifest).toMatchObject({ size: 800 * 1024 * 1024, chunkCount: 200, chunkSize: 4 * 1024 * 1024 })
    expect(file.slice).not.toHaveBeenCalled()
  })

  it('rejects a file one byte above 800 MiB before making an API request', async () => {
    const { fetcher } = setup()
    const file = { name: 'too-large.bin', size: 800 * 1024 * 1024 + 1 } as File
    await expect(createRelayTransfer({ kind: 'file', text: '', file, password: 'password', createUrl: '/create', completeUrl: '/complete' })).rejects.toThrow('800MB')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('preserves the one-time code if local storage cannot be prepared', async () => {
    const { fetcher } = setup()
    vi.mocked(createRelayDownloadStorage).mockRejectedValueOnce(new Error('no disk space'))
    await expect(openRelayTransfer(options)).rejects.toThrow('no disk space')
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/meta'])
  })

  it('prepares disk before opening and releases disk plus the URL when the result is disposed', async () => {
    const { events, storage } = setup()
    const result = await openRelayTransfer(options)
    expect(createRelayDownloadStorage).toHaveBeenCalledWith(800 * 1024 * 1024)
    expect(events).toEqual(['storage', '/open', ...chunks.map(chunk => `/chunk/${chunk.index}`)])
    expect(storage.write).toHaveBeenCalledTimes(200)
    expect(storage.write).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]))
    expect(storage.finish).toHaveBeenCalledWith('image/png')
    expect(storage.dispose).not.toHaveBeenCalled()
    await result.file?.dispose()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:relay-test')
    expect(storage.dispose).toHaveBeenCalledOnce()
  })

  it('removes a partial file when writing a decrypted chunk fails', async () => {
    const { storage } = setup()
    storage.write.mockRejectedValueOnce(new Error('disk full'))
    await expect(openRelayTransfer(options)).rejects.toThrow('disk full')
    expect(storage.dispose).toHaveBeenCalledOnce()
    expect(storage.finish).not.toHaveBeenCalled()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('cleans a prepared file without consuming the code if the receive is cancelled', async () => {
    const { storage, fetcher } = setup()
    const controller = new AbortController()
    vi.mocked(createRelayDownloadStorage).mockImplementationOnce(async () => { controller.abort(); return storage })
    await expect(openRelayTransfer({ ...options, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/meta'])
    expect(storage.dispose).toHaveBeenCalledOnce()
  })
})
