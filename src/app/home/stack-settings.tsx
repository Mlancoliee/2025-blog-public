'use client'

import { useEffect, useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { stackError, stackRequest } from '@/lib/stack/api'
import { encode64 } from '@/lib/stack/crypto'
import type { APIKeyInfo, StackAccount } from '@/lib/stack/types'
import { StackDialog } from './stack-dialog'
import { VaultGate } from './vault-gate'
import styles from './stack-workspace.module.css'

export function StackSettings({ owner, dataKey, epoch, onClose }: { owner: string; dataKey: Uint8Array; epoch: string; onClose: () => void }) {
	const [keys, setKeys] = useState<APIKeyInfo[]>([])
	const [loading, setLoading] = useState(true)
	const [name, setName] = useState('')
	const [days, setDays] = useState(30)
	const [issued, setIssued] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	const [reveal, setReveal] = useState(false)
	const [account, setAccount] = useState<StackAccount | null>(null)
	const [tab, setTab] = useState<'keys' | 'security'>('keys')
	useEffect(() => {
		const controller = new AbortController()
		void stackRequest<{ keys: APIKeyInfo[] }>(owner, '/api-keys', 'GET', undefined, controller.signal)
			.then(result => setKeys(result.keys)).catch(caught => { if (!controller.signal.aborted) setError(stackError(caught)) })
			.finally(() => { if (!controller.signal.aborted) setLoading(false) })
		return () => controller.abort()
	}, [owner])
	async function run(action: () => Promise<void>) {
		if (busy) return
		setBusy(true); setError(''); setNotice('')
		try { await action() } catch (caught) { setError(stackError(caught)) } finally { setBusy(false) }
	}
	async function copy(value: string) {
		try { await navigator.clipboard.writeText(value); setNotice('已复制') }
		catch { setError('无法自动复制，请选中文字手动复制。') }
	}
	return <StackDialog title='访问与安全' onClose={() => { if (!busy) onClose() }}>
		<div className={styles.tabs}><button aria-pressed={tab === 'keys'} onClick={() => { setTab('keys'); setAccount(null) }}>访问 Key</button><button aria-pressed={tab === 'security'} onClick={() => setTab('security')}>加密设置</button></div>
		{tab === 'keys' ? <>
			<p className={styles.caption}>API Key 只能读取密文；解密需要数据密钥。</p>
			<form className={styles.keyForm} onSubmit={e => { e.preventDefault(); if (loading || issued) return; void run(async () => {
				const result = await stackRequest<{ key: APIKeyInfo; api_key: string }>(owner, '/api-keys', 'POST', { name: name.trim(), expires_in_days: days })
				setKeys(current => [result.key, ...current]); setIssued(result.api_key); setName('')
			}) }}>
				<label>名称<input value={name} onChange={e => setName(e.target.value)} required maxLength={80} placeholder='例如：我的 AI 助手'/></label>
				<label>有效天数<input type='number' min={1} max={365} required value={days} onChange={e => setDays(Number(e.target.value))}/></label>
				<button className={styles.primaryButton} disabled={loading || busy || !!issued}><Plus size={16}/> 创建</button>
			</form>
			{issued && <section className={styles.secretBox}><strong>完整 Key 只显示这一次</strong><textarea readOnly value={issued} aria-label='新创建的 API Key' rows={2}/><div><button onClick={() => void copy(issued)}><Copy size={15}/>复制 Key</button><button onClick={() => setIssued('')}>我已保存</button></div></section>}
			<div className={styles.keyList}>{loading ? <p className={styles.muted} role='status'>正在读取访问 Key…</p> : keys.length === 0 ? <p className={styles.muted}>还没有访问 Key。</p> : keys.map(key => <div key={key.id}><div><strong>{key.name}</strong><p><code>{key.prefix}…</code> · {new Date(key.expires).toLocaleDateString('zh-CN')} {key.expires <= Date.now() ? '已过期' : '到期'}</p></div><button aria-label={`撤销 ${key.name}`} disabled={busy} onClick={() => {
				if (window.confirm(`撤销“${key.name}”？使用此 Key 的工具将无法继续读取。`)) void run(async () => { await stackRequest(owner, `/api-keys/${key.id}`, 'DELETE'); setKeys(current => current.filter(item => item.id !== key.id)) })
			}}><Trash2 size={16}/></button></div>)}</div>
		</> : <>
			{account ? <><p className={styles.caption}>更改后，旧恢复密钥将失效。</p><VaultGate owner={owner} account={account} dataKey={dataKey} onUnlock={key => { key.fill(0); setAccount(null); setNotice('加密口令与恢复密钥已更新。') }}/></> : <>
				<button className={styles.outlineButton} disabled={busy} onClick={() => void run(async () => { const result = await stackRequest<{ account: StackAccount | null }>(owner, '/bootstrap'); if (result.account?.sync_epoch !== epoch) throw new Error('空间已变化，请导出草稿并重新解锁后再修改加密设置。'); setAccount(result.account) })}>更改加密口令</button>
				<hr className={styles.rule}/><h3>数据密钥</h3><p className={styles.caption}>持有此密钥和密文即可解密所有笔记；更改口令不会撤销此密钥。</p>
				{reveal ? <section className={styles.secretBox}><textarea readOnly value={encode64(dataKey)} rows={2} aria-label='账户数据密钥'/><div><button onClick={() => void copy(encode64(dataKey))}><Copy size={15}/>复制数据密钥</button><button onClick={() => setReveal(false)}>隐藏</button></div></section> : <button className={styles.outlineButton} onClick={() => setReveal(true)}>显示数据密钥</button>}
			</>}
		</>}
		<div className={styles.settingsFeedback} aria-live='polite'>{error ? <p role='alert' className={styles.error}>{error}</p> : notice && <p>{notice}</p>}</div>
	</StackDialog>
}
