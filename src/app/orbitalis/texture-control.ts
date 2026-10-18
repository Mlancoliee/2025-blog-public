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
	const encoded = new Map<TextureQuality, Blob>()
	let current: THREE.Texture | undefined
	let request: AbortController | undefined
	let pending: Promise<boolean> | undefined
	let disposed = false
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
		request?.abort()
		pending = undefined
		encoded.clear()
		signal.removeEventListener('abort', dispose)
		material.map = material.emissiveMap = null
		if (current) release(current)
		current = undefined
	}
	signal.addEventListener('abort', dispose, { once: true })

	const load = async (quality: TextureQuality, controller: AbortController) => {
		const level = levels[quality]
		let texture: THREE.Texture | undefined
		let bitmap: ImageBitmap | undefined
		let decoded = false
		try {
			let source = encoded.get(quality)
			if (!source) {
				// Cache only compressed bytes; the four quality levels bound this cache to about 35.5 MB.
				const parts = await Promise.all(level.files.map(async name => {
					const response = await fetch(sceneAssetUrl(name), { signal: controller.signal, mode: 'cors', priority: 'low' })
					if (!response.ok) throw new Error('download')
					return response.blob()
				}))
				controller.signal.throwIfAborted()
				source = new Blob(parts, { type: level.mime })
				encoded.set(quality, source)
			}
			controller.signal.throwIfAborted()
			bitmap = await createImageBitmap(source, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
			controller.signal.throwIfAborted()
			if (bitmap.width !== level.width || bitmap.height !== level.height) throw new Error('dimensions')
			decoded = true
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
			if (!controller.signal.aborted) {
				if (!decoded) encoded.delete(quality)
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
			if (request === controller) {
				request = undefined
				pending = undefined
			}
		}
	}

	return {
		select(quality: TextureQuality): Promise<boolean> {
			if (disposed || signal.aborted) return Promise.resolve(false)
			if (!supported.includes(quality)) {
				report({ error: `当前设备不支持 ${quality} 贴图，已保留现有清晰度` })
				return Promise.resolve(false)
			}
			if (state.loading && state.requested === quality && pending) return pending
			request?.abort()
			request = undefined
			pending = undefined
			if (quality === state.active) {
				report({ requested: quality, loading: false, error: null })
				return Promise.resolve(true)
			}
			const controller = new AbortController()
			request = controller
			report({ requested: quality, loading: true, error: null })
			pending = load(quality, controller)
			return pending
		},
		dispose
	}
}
