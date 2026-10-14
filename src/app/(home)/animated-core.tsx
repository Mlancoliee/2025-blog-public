'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { orbitalisAssets } from './orbitalis-assets'
import type { OrbitalisInput } from './orbitalis-scene'

interface AnimatedCoreProps {
	className?: string
}

export default function AnimatedCore({ className }: AnimatedCoreProps) {
	const router = useRouter()
	const rapidClicks = useRef<number[]>([])
	const containerRef = useRef<HTMLDivElement | null>(null)
	const input = useRef<OrbitalisInput>({ hovered: false, pointer: { x: 0, y: 0 }, activation: 0 })
	const pointerBounds = useRef<DOMRect | null>(null)
	const [ready, setReady] = useState(false)

	const handlePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
		const rect = pointerBounds.current
		if (!rect || event.pointerType === 'touch') return
		input.current.pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2
		input.current.pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * -2
	}, [])

	const handlePointerLeave = useCallback(() => {
		input.current.hovered = false
		input.current.pointer = { x: 0, y: 0 }
		pointerBounds.current = null
	}, [])

	useEffect(() => {
		const container = containerRef.current
		if (!container) return
		const controller = new AbortController()
		let started = false
		let cleanup: (() => void) | undefined
		const observer = new IntersectionObserver(entries => {
			if (started || !entries.some(entry => entry.isIntersecting)) return
			started = true
			observer.disconnect()
			void import('./orbitalis-scene')
				.then(({ mountOrbitalis }) => mountOrbitalis(
					container,
					input.current,
					controller.signal,
					() => setReady(true),
					() => setReady(false)
				))
				.then(dispose => {
					if (controller.signal.aborted) dispose()
					else cleanup = dispose
				})
				.catch(() => {
					if (!controller.signal.aborted) setReady(false)
				})
		}, { rootMargin: '120px' })
		observer.observe(container)
		return () => {
			observer.disconnect()
			controller.abort()
			cleanup?.()
		}
	}, [])

	return (
		<button
			type='button'
			aria-label='轻触放大 Orbitalis 星球，快速点击五次进入空间站'
			onPointerEnter={event => {
				if (event.pointerType === 'touch') return
				input.current.hovered = true
				pointerBounds.current = event.currentTarget.getBoundingClientRect()
			}}
			onPointerMove={handlePointerMove}
			onPointerLeave={handlePointerLeave}
			onPointerCancel={handlePointerLeave}
			onClick={() => {
				input.current.activation = 1
				const now = performance.now()
				rapidClicks.current = rapidClicks.current.filter(time => now - time <= 1500)
				rapidClicks.current.push(now)
				if (rapidClicks.current.length === 5) {
					rapidClicks.current = []
					router.push('/orbitalis')
				}
			}}
			className={cn('relative block h-full w-full touch-manipulation overflow-hidden bg-transparent select-none focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-inset focus-visible:outline-none', className)}>
			<img
				src={orbitalisAssets.poster}
				alt=''
				aria-hidden='true'
				width={720}
				height={576}
				loading='lazy'
				decoding='async'
				fetchPriority='low'
				className={cn('pointer-events-none absolute top-0 left-1/2 h-full w-auto max-w-none -translate-x-1/2 transition-opacity duration-500 motion-reduce:transition-none', ready && 'opacity-0')}
			/>
			<div ref={containerRef} className={cn('pointer-events-none absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none', !ready && 'opacity-0')} />
		</button>
	)
}
