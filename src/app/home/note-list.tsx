'use client'

import { memo, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FileText, Star } from 'lucide-react'
import type { Note } from '@/lib/stack/workspace'
import styles from './stack-workspace.module.css'

const formatter = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' })
const NoteRow = memo(function NoteRow({ note, selected, onSelect }: { note: Note; selected: boolean; onSelect: (id: string) => void }) {
	const preview = note.content.body.slice(0, 250).replace(/[#*`>]/g, '').slice(0, 125)
	return <button className={styles.noteRow} aria-current={selected ? 'true' : undefined} onClick={() => onSelect(note.id)}>
		<div><FileText size={14}/><strong>{note.content.title.trim() || '未命名笔记'}</strong>{note.content.favorite && <Star size={13} className={styles.star}/>}</div>
		{preview && <p>{preview}</p>}
		<footer><time>{formatter.format(new Date(note.updated))}</time>{note.conflict ? <span className={styles.error}>版本冲突</span> : note.dirty ? <span>待保存</span> : itemTags(note)}</footer>
	</button>
})
function itemTags(note: Note) { return note.content.tags.filter(Boolean).slice(0, 1).map(value => <span key={value}># {value}</span>) }

export const NoteList = memo(function NoteList({ items, selected, onSelect, empty, filter }: { items: Note[]; selected: string | null; onSelect: (id: string) => void; empty?: ReactNode; filter: string }) {
	'use no memo'
	// Virtualizer updates its instance imperatively; read its range on every render.
	const scroll = useRef<HTMLDivElement>(null)
	const focusIndex = useRef<number | null>(null)
	const getItemKey = useCallback((index: number) => items[index].id, [items])
	const virtual = useVirtualizer({ count: items.length, getScrollElement: () => scroll.current, estimateSize: () => 140, overscan: 5, getItemKey, useFlushSync: false })
	const rows = virtual.getVirtualItems()
	useEffect(() => { virtual.scrollToOffset(0) }, [filter, virtual])
	function focusRow() {
		if (focusIndex.current === null) return
		const button = scroll.current?.querySelector<HTMLButtonElement>('[data-index="' + focusIndex.current + '"] button')
		if (button) { button.focus({ preventScroll: true }); focusIndex.current = null }
	}
	useEffect(focusRow, [rows])
	return <div ref={scroll} className={styles.noteList} tabIndex={0} aria-label='滚动笔记列表' onKeyDown={event => {
		const index = Number((event.target as HTMLElement).closest('[data-index]')?.getAttribute('data-index') ?? 0)
		const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null
		if (next === null || !items.length) return
		event.preventDefault()
		focusIndex.current = Math.max(0, Math.min(items.length - 1, next))
		virtual.scrollToIndex(focusIndex.current, { align: 'auto' })
		focusRow()
	}}>
		{empty ?? <div className={styles.virtualNotes} style={{ height: virtual.getTotalSize() }}>{rows.map(row => <div key={row.key} ref={virtual.measureElement} data-index={row.index} className={styles.virtualRow} style={{ transform: 'translateY(' + row.start + 'px)' }}><NoteRow note={items[row.index]} selected={selected === items[row.index].id} onSelect={onSelect}/></div>)}</div>}
	</div>
})
