import { getAssetUrl } from '@/lib/asset-url'

const directory = '/images/project/orbitalis'

export const orbitalisAssets = {
	model: getAssetUrl(`${directory}/planet-mesh-v1.glb`),
	preview: getAssetUrl(`${directory}/planet-preview-1k-v1.webp`),
	texture: getAssetUrl(`${directory}/planet-color-4k-v1.avif`),
	poster: getAssetUrl(`${directory}/planet-poster-v1.webp`)
}
