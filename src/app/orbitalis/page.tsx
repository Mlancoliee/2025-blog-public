import type { Metadata } from 'next'
import OrbitalisClient from './orbitalis-client'

export const metadata: Metadata = {
	title: 'Orbitalis · Pelagia',
	description: '探索风暴星球与环形空间站，切换 1K、4K、8K、16K 贴图。'
}

export default function OrbitalisPage() {
	return <OrbitalisClient />
}
