import { describe, expect, it, vi } from 'vitest'
import { readJsonlFile } from '../../src/lib/codex-session/jsonl-reader'

describe('readJsonlFile', () => {
	it('保留物理行号并在 BOM、空行和损坏行后继续', async () => {
		const file = new File(['\ufeff{"type":"session_meta","payload":{}}\r\n\r\nnot-json\n{"type":"event_msg","payload":{"type":"task_complete"}}'], 'session.jsonl')
		const parsed = await readJsonlFile(file)

		expect(parsed.records).toHaveLength(3)
		expect(parsed.records.map(item => item.sourceRef.line)).toEqual([1, 3, 4])
		expect(parsed.records[1].parseError).toBeTruthy()
		expect(parsed.records[2].record?.type).toBe('event_msg')
	})

	it('逐字节读取时保留跨块中文、表情、CRLF 和源字节范围', async () => {
		const stream = vi.spyOn(Blob.prototype, 'stream').mockImplementation(function (this: Blob) {
			const blob = this
			return new ReadableStream<Uint8Array>({
				async start(controller) {
					const bytes = new Uint8Array(await blob.arrayBuffer())
					for (let offset = 0; offset < bytes.length; offset++) controller.enqueue(bytes.subarray(offset, offset + 1))
					controller.close()
				}
			})
		})
		try {
			const first = '{"type":"session_meta","payload":{"id":"中文🌊"}}'
			const last = '{"type":"event_msg","payload":{"text":"第二行"}}'
			const file = new File(['\ufeff' + first + '\r\n\n' + last], 'utf8.jsonl')
			const parsed = await readJsonlFile(file)
			expect(parsed.diagnosticCount).toBe(0)
			expect(parsed.lineCount).toBe(3)
			expect(parsed.records.map(item => item.sourceRef.line)).toEqual([1, 3])
			expect(parsed.records[0].record).toMatchObject({ payload: { id: '中文🌊' } })
			expect(parsed.records[1].record).toMatchObject({ payload: { text: '第二行' } })
			for (const [index, expected] of [first, last].entries()) {
				const ref = parsed.records[index].sourceRef
				expect(await file.slice(ref.byteStart, ref.byteEnd).text()).toBe(expected)
			}
		} finally {
			stream.mockRestore()
		}
	})
})
