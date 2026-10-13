'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangelogBatch } from './types'

export function useChangelogFeed(initialBatch: ChangelogBatch, dates: string[]) {
	const [feed, setFeed] = useState(initialBatch)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState(false)
	const [targetDate, setTargetDate] = useState<string | null>(null)
	const feedRef = useRef(initialBatch)
	const requestRef = useRef<AbortController | null>(null)
	const sentinelRef = useRef<HTMLDivElement>(null)

	const loadMore = useCallback(async () => {
		if (requestRef.current || !feedRef.current.hasMore) return
		const controller = new AbortController()
		requestRef.current = controller
		setLoading(true)
		setError(false)

		try {
			const before = feedRef.current.entries.at(-1)!.date
			const response = await fetch(`/api/changelog?before=${before}`, { signal: controller.signal })
			if (!response.ok) throw new Error('Changelog request failed')
			const batch: ChangelogBatch = await response.json()
			if (controller.signal.aborted) return
			const next = { entries: [...feedRef.current.entries, ...batch.entries], hasMore: batch.hasMore }
			feedRef.current = next
			setFeed(next)
		} catch {
			if (!controller.signal.aborted) setError(true)
		} finally {
			if (!controller.signal.aborted) {
				requestRef.current = null
				setLoading(false)
			}
		}
	}, [])

	useEffect(() => {
		return () => {
			requestRef.current?.abort()
			requestRef.current = null
		}
	}, [])

	useEffect(() => {
		const readHash = () => {
			const date = window.location.hash.slice(1)
			setTargetDate(dates.includes(date) ? date : null)
		}
		readHash()
		window.addEventListener('hashchange', readHash)
		return () => window.removeEventListener('hashchange', readHash)
	}, [dates])

	useEffect(() => {
		if (!targetDate || error) return
		if (!feed.entries.some(entry => entry.date === targetDate)) {
			if (!loading && feed.hasMore) void loadMore()
			return
		}
		const frame = requestAnimationFrame(() => {
			document.getElementById(targetDate)?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' })
			setTargetDate(null)
		})
		return () => cancelAnimationFrame(frame)
	}, [targetDate, feed, loading, error, loadMore])

	useEffect(() => {
		if (!feed.hasMore || loading || error || targetDate) return
		const sentinel = sentinelRef.current
		if (!sentinel) return
		const observer = new IntersectionObserver(
			observations => {
				if (observations.some(observation => observation.isIntersecting)) void loadMore()
			},
			{ rootMargin: '0px 0px 700px 0px' }
		)
		observer.observe(sentinel)
		return () => observer.disconnect()
	}, [feed.hasMore, feed.entries.length, loading, error, targetDate, loadMore])

	return { ...feed, loading, error, targetDate, loadMore, sentinelRef }
}
