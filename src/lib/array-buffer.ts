// DOM file sinks need ordinary backing memory; reuse its existing byte range.
export function arrayBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	return bytes.buffer instanceof ArrayBuffer
		? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
		: new Uint8Array(bytes)
}
