'use client'

import { memo, useEffect, useRef } from 'react'
import type { ChangelogBatch, ChangelogEntry } from './types'
import { useChangelogFeed } from './use-changelog-feed'
import styles from './changelog.module.css'

type Props = { initialBatch: ChangelogBatch; dates: string[] }

export default function ChangelogTimeline({ initialBatch, dates }: Props) {
	const { entries, hasMore, loading, error, targetDate, loadMore, sentinelRef } = useChangelogFeed(initialBatch, dates)
	const timelineRef = useRef<HTMLDivElement>(null)
	const years = Array.from(new Set(entries.map(entry => entry.date.slice(0, 4))))
	const yearLinks = Array.from(new Set(dates.map(date => date.slice(0, 4))))

	useEffect(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

		const observer = new IntersectionObserver(
			observations => {
				const entering = observations.filter(observation => observation.isIntersecting)
				entering.forEach(({ target }, index) => {
					const element = target as HTMLElement
					element.style.setProperty('--entry-delay', `${Math.min(index, 3) * 120}ms`)
					element.dataset.revealed = 'true'
					observer.unobserve(element)
				})
			},
			{ rootMargin: '0px 0px -24px 0px', threshold: 0 }
		)

		timelineRef.current?.querySelectorAll('[data-log-entry]:not([data-revealed])').forEach(element => observer.observe(element))
		return () => observer.disconnect()
	}, [entries])

	return (
		<div ref={timelineRef} id='changelog-timeline' className={styles.timeline}>
			<nav aria-label='更新日志年份' className={styles.years}>
				{yearLinks.map(year => (
					<a key={year} href={`#${dates.find(date => date.startsWith(year))}`}>{year}</a>
				))}
				<p className={styles.jumpStatus} role='status'>
					{targetDate && (error ? '暂时没能加载这段记录。' : '正在加载较早的记录…')}
					{targetDate && error && (
						<button type='button' className={styles.retry} onClick={() => void loadMore()}>重试</button>
					)}
				</p>
			</nav>
			{years.map(year => (
				<section key={year} aria-labelledby={`changelog-year-${year}`} className={styles.yearGroup}>
					<h2 id={`changelog-year-${year}`} className={styles.year}>
						{year}
					</h2>
					<ol className={styles.entries}>
						{entries.filter(entry => entry.date.startsWith(year)).map(entry => (
							<ChangelogItem key={entry.date} entry={entry} latest={entry.date === dates[0]} />
						))}
					</ol>
				</section>
			))}
			<div ref={sentinelRef} className={styles.feedEnd} aria-busy={loading}>
				<p role='status'>
					{error ? '加载暂时失败，已显示的记录仍可阅读。' : loading ? '正在加载更早的更新…' : hasMore ? '继续下滑，加载更早的更新' : '已到最早的记录'}
				</p>
				{error && <button type='button' className={styles.retry} onClick={() => void loadMore()}>重新加载</button>}
				<span className='sr-only'>已加载 {entries.length} / {dates.length} 条记录</span>
			</div>
		</div>
	)
}

const ChangelogItem = memo(function ChangelogItem({ entry, latest }: { entry: ChangelogEntry; latest: boolean }) {
	return (
		<li id={entry.date} data-log-entry data-latest={latest || undefined} className={styles.entry}>
			<span className={styles.lineFill} aria-hidden='true' />
			<span className={styles.nodeHalo} aria-hidden='true' />
			<span className={styles.node} aria-hidden='true' />
			<div className={styles.date}>
				<a href={`#${entry.date}`} aria-label={`${entry.date} 的更新：${entry.title}`}>
					<time dateTime={entry.date}>{entry.date.slice(5).replace('-', '.')}</time>
				</a>
				{latest && <span className={styles.latest}>最新</span>}
			</div>
			<div className={styles.content}>
				<h3>{entry.title}</h3>
				<ul className={styles.changes}>
					{entry.changes.map((change, index) => (
						<li key={index}>
							<span className={styles.changeType}>{change.type}</span>
							<div className={styles.changeBody}>
								{change.beta && (
									<div className={styles.changeBadges}>
										<span className={styles.beta}>Beta</span>
										{change.outcome && <span className={styles.outcome}>{change.outcome === 'removed' ? '已移除' : '已回退'}</span>}
									</div>
								)}
								<p>{change.text}</p>
							</div>
						</li>
					))}
				</ul>
			</div>
		</li>
	)
})
