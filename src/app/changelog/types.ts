export type ChangelogEntry = {
	date: string
	title: string
	changes: {
		type: '新增' | '改进' | '修复' | '优化' | '移除'
		text: string
		beta?: boolean
		outcome?: 'removed' | 'reverted'
	}[]
}

export type ChangelogBatch = {
	entries: ChangelogEntry[]
	hasMore: boolean
}

export const CHANGELOG_BATCH_SIZE = 10
