import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { changelogDates, getChangelogBatch } from './entries'
import ChangelogTimeline from './changelog-timeline'
import styles from './changelog.module.css'

const title = '更新日志'
const description = '记一下这个站又改了些什么。功能新增、体验改进，以及一路修好的问题。'

export const metadata: Metadata = {
	title,
	description,
	openGraph: { title, description },
	twitter: { title, description }
}

export default function ChangelogPage() {
	return (
		<div className={styles.page}>
			<Link href='/about' className={styles.back}>
				<ArrowLeft size={16} aria-hidden='true' />
				关于本站
			</Link>
			<header className={styles.header}>
				<p className={styles.eyebrow}>Changelog</p>
				<h1>更新日志</h1>
				<p className={styles.description}>记一下这个站又改了些什么。</p>
				<p className={styles.archiveMeta}>
					{changelogDates.at(-1)} — {changelogDates[0]} · {changelogDates.length} 条记录
				</p>
			</header>
			<ChangelogTimeline initialBatch={getChangelogBatch()} dates={changelogDates} />
		</div>
	)
}
