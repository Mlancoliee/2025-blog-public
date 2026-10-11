import 'server-only'

import { entries2025 } from './entries/2025'
import { entries2026H1 } from './entries/2026-h1'
import { entries2026H2 } from './entries/2026-h2'
import { CHANGELOG_BATCH_SIZE, type ChangelogBatch } from './types'

// Descending commit dates, one group per day. Keep the complete archive on the server.
const entries = [...entries2026H2, ...entries2026H1, ...entries2025]
export const changelogDates = entries.map(entry => entry.date)

export function getChangelogBatch(before?: string): ChangelogBatch {
	const start = before ? changelogDates.indexOf(before) + 1 : 0
	const end = start + CHANGELOG_BATCH_SIZE
	return { entries: entries.slice(start, end), hasMore: end < entries.length }
}
