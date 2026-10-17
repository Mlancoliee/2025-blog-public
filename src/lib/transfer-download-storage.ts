'use client'

import { arrayBufferView } from './array-buffer'

const DIRECTORY_NAME = 'winrisef-public-transfer'
const STALE_FILE_MS = 24 * 60 * 60 * 1000

export type RelayDownloadStorage = {
	write: (bytes: Uint8Array) => Promise<void>
	finish: (contentType: string) => Promise<Blob>
	dispose: () => Promise<void>
}

export async function createRelayDownloadStorage(size: number): Promise<RelayDownloadStorage> {
	const storage = navigator.storage
	if (!storage?.getDirectory) throw new Error('当前浏览器不支持接收超过 200MB 的文件，请换用支持大文件保存的浏览器')

	const directory = await (await storage.getDirectory()).getDirectoryHandle(DIRECTORY_NAME, { create: true })
	// Recover temporary files left by an interrupted tab without touching recent downloads.
	for await (const [name] of directory as FileSystemDirectoryHandle & AsyncIterable<[string, FileSystemHandle]>) {
		const createdAt = Number(name.split('-')[0])
		if (createdAt && Date.now() - createdAt > STALE_FILE_MS) await directory.removeEntry(name).catch(() => {})
	}
	const estimate = await storage.estimate?.().catch(() => undefined)
	if (estimate?.quota != null && size > estimate.quota - (estimate.usage || 0)) throw new Error('浏览器可用存储空间不足，请清理空间后重试')

	const name = `${Date.now()}-${crypto.randomUUID()}.part`
	const handle = await directory.getFileHandle(name, { create: true })
	let writer: FileSystemWritableFileStream
	try {
		writer = await handle.createWritable()
	} catch {
		await directory.removeEntry(name).catch(() => {})
		throw new Error('无法准备本地文件，请检查浏览器权限和磁盘空间')
	}
	let closed = false
	let disposed = false

	return {
		async write(bytes) {
			try {
				await writer.write(arrayBufferView(bytes))
			} catch (error) {
				if (error instanceof DOMException && error.name === 'QuotaExceededError') throw new Error('浏览器可用存储空间不足，文件接收已停止')
				throw error
			}
		},
		async finish(contentType) {
			await writer.close()
			closed = true
			const file = await handle.getFile()
			return file.slice(0, file.size, contentType)
		},
		async dispose() {
			if (disposed) return
			disposed = true
			if (!closed) await writer.abort().catch(() => {})
			await directory.removeEntry(name).catch(() => {})
		}
	}
}
