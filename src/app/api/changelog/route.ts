import { NextResponse } from 'next/server'
import { changelogDates, getChangelogBatch } from '@/app/changelog/entries'

export function GET(request: Request) {
	const before = new URL(request.url).searchParams.get('before')
	if (!before || !changelogDates.includes(before)) {
		return NextResponse.json({ error: 'Invalid changelog cursor' }, { status: 400 })
	}
	return NextResponse.json(getChangelogBatch(before), {
		headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' }
	})
}
