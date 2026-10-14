import { getAssetUrl } from '@/lib/asset-url'

export const TEXTURE_QUALITIES = ['1K', '4K', '8K', '16K'] as const
export type TextureQuality = typeof TEXTURE_QUALITIES[number]
export type TextureLevel = { width: number; height: number; mime: string; files: string[] }
export type TextureState = {
	active: TextureQuality | null
	requested: TextureQuality
	loading: boolean
	supported: TextureQuality[]
	dimensions: [number, number] | null
	error: string | null
}

export const sceneAssetUrl = (name: string) => getAssetUrl(`/images/project/orbitalis/${name}`)

export const initialTextureState: TextureState = {
	active: null,
	requested: '4K',
	loading: false,
	supported: [],
	dimensions: null,
	error: null
}
