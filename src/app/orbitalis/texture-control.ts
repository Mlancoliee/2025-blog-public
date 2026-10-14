import * as THREE from 'three'
import { sceneAssetUrl, TEXTURE_QUALITIES, type TextureLevel, type TextureQuality, type TextureState } from './scene-assets'

export function createTextureControl(
	renderer: THREE.WebGLRenderer,
	material: THREE.MeshStandardMaterial,
	levels: Record<TextureQuality, TextureLevel>,
	signal: AbortSignal,
	onChange: (state: TextureState) => void
) {
	const supported = TEXTURE_QUALITIES.filter(quality => Math.max(levels[quality].width, levels[quality].height) <= renderer.capabilities.maxTextureSize)
	let current: THREE.Texture | undefined
	let request: AbortController | undefined
	let disposed = false
	let revision = 0
	let state: TextureState = { active: null, requested: '1K', loading: false, supported, dimensions: null, error: null }
	const report = (patch: Partial<TextureState>) => {
		state = { ...state, ...patch }
		if (!disposed && !signal.aborted) onChange(state)
	}
	const release = (texture: THREE.Texture) => {
		texture.dispose()
		;(texture.image as ImageBitmap).close()
	}
	const dispose = () => {
		if (disposed) return
		disposed = true
		revision++
		request?.abort()
		signal.removeEventListener('abort', dispose)
		material.map = material.emissiveMap = null
		if (current) release(current)
		current = undefined
	}
	signal.addEventListener('abort', dispose, { once: true })

	return {
		async select(quality: TextureQuality) {
			if (disposed || signal.aborted) return false
			if (!supported.includes(quality)) {
				report({ error: `当前设备不支持 ${quality} 贴图，已保留现有清晰度` })
				return false
			}
			const id = ++revision
			request?.abort()
			request = undefined
			if (quality === state.active) {
				report({ requested: quality, loading: false, error: null })
				return true
			}
			const controller = new AbortController()
			request = controller
			const level = levels[quality]
			let texture: THREE.Texture | undefined
			let bitmap: ImageBitmap | undefined
			report({ requested: quality, loading: true, error: null })
			try {
				// High-resolution AVIF bytes can be split for CDN file-size limits; this remains one encoded image.
				const parts = await Promise.all(level.files.map(async name => {
					const response = await fetch(sceneAssetUrl(name), { signal: controller.signal, mode: 'cors', priority: 'low' })
					if (!response.ok) throw new Error('download')
					return response.arrayBuffer()
				}))
				controller.signal.throwIfAborted()
				bitmap = await createImageBitmap(new Blob(parts, { type: level.mime }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
				if (id !== revision || disposed) return false
				if (bitmap.width !== level.width || bitmap.height !== level.height) throw new Error('dimensions')
				texture = new THREE.Texture(bitmap)
				texture.flipY = false
				texture.colorSpace = THREE.SRGBColorSpace
				texture.wrapS = THREE.RepeatWrapping
				texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4)
				texture.needsUpdate = true
				renderer.initTexture(texture)
				const gl = renderer.getContext()
				if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error('memory')
				const previous = current
				material.map = material.emissiveMap = texture
				material.needsUpdate = true
				current = texture
				texture = undefined
				bitmap = undefined
				if (previous) release(previous)
				report({ active: quality, loading: false, dimensions: [level.width, level.height] })
				return true
			} catch (error) {
				if (id === revision && !disposed && !controller.signal.aborted) {
					const message = error instanceof Error && error.message === 'memory'
						? '显存不足，已保留现有清晰度'
						: `${quality} 贴图加载失败，已保留现有清晰度，可点击重试`
					report({ requested: state.active ?? quality, loading: false, error: message })
				}
				return false
			} finally {
				controller.abort()
				texture?.dispose()
				bitmap?.close()
			}
		},
		dispose
	}
}
