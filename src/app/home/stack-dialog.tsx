'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './stack-workspace.module.css'

export function StackDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
	const ref = useRef<HTMLDialogElement>(null)
	useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close() }, [])
	return <dialog ref={ref} className={styles.dialog} aria-label={title} onCancel={e => { e.preventDefault(); onClose() }}>
		<header className={styles.dialogHeader}><h2>{title}</h2><button onClick={onClose} aria-label='关闭'><X size={19}/></button></header>
		{children}
	</dialog>
}
