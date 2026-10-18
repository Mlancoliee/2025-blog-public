'use client'

import { useEffect, useState } from 'react'
import styles from './stack-workspace.module.css'

// The blog renderer trusts authored articles. Private notes may come from tools;
// use a local sanitizer and disallow embedded resources/tracking images here.
export function NotePreview({ body }: { body: string }) {
	const [html, setHtml] = useState('')
	const [error, setError] = useState(false)
	useEffect(() => {
		let active = true
		void Promise.all([import('marked'), import('dompurify')]).then(([{ marked }, { default: purifier }]) => {
			const parsed = marked.parse(body, { async: false, gfm: true })
			const clean = purifier.sanitize(parsed, { ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'], ALLOWED_ATTR: ['href', 'title'], ALLOW_DATA_ATTR: false })
			// Reparse only sanitized HTML; outbound links never navigate the editor.
			const template = document.createElement('template')
			template.innerHTML = clean
			template.content.querySelectorAll('a').forEach(link => {
				if (!/^https?:\/\//i.test(link.getAttribute('href') || '')) link.removeAttribute('href')
				link.target = '_blank'; link.rel = 'noopener noreferrer'
			})
			if (active) { setHtml(template.innerHTML); setError(false) }
		}).catch(() => { if (active) { setHtml(''); setError(true) } })
		return () => { active = false }
	}, [body])
	return error ? <p className={styles.error}>预览暂时不可用，请返回编辑。</p> : <div className={styles.preview} dangerouslySetInnerHTML={{ __html: html }}/>
}
