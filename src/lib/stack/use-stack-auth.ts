'use client'

import { useEffect, useState } from 'react'
import { ClientResponseError, type RecordModel } from 'pocketbase'
import { getStackPocketBase } from './pocketbase'
import { checkBootstrap } from './api'
import type { Bootstrap, StackAccount } from './types'

export type AuthScreen = 'login' | 'register' | 'register-code' | 'verify' | 'forgot' | 'reset-sent' | 'setup' | 'unlock' | 'deleting' | 'connection-error'
type Challenge = { challenge: string; expires_in: number; retry_after: number }
const errors: Record<string, string> = {
	invalid_email: '请输入有效的邮箱地址。', invalid_code: '验证码不正确，请检查后重试。',
	code_expired: '验证码已过期，请重新发送。', code_locked: '尝试次数已用完，请重新发送验证码。',
	resend_too_soon: '发送太频繁，请等待一分钟后重试。', too_many_requests: '请求次数已达上限，请稍后再试。',
	email_delivery_failed: '邮件发送失败，请稍后重试。', invalid_password: '密码需为 8–128 位，且两次输入一致。',
	email_in_use: '该邮箱已有账户，请返回登录。'
}
function message(error: unknown, fallback: string) {
	if (!(error instanceof ClientResponseError)) return error instanceof Error ? error.message : fallback
	if (error.status === 0) return '连接失败，请检查网络后重试。'
	return errors[error.response?.error?.code] || (error.status === 429 ? errors.too_many_requests : fallback)
}

export function useStackAuth() {
	const [screen, setScreen] = useState<AuthScreen>('login')
	const [owner, setOwner] = useState('')
	const [account, setAccount] = useState<StackAccount | null>(null)
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [passwordConfirm, setPasswordConfirm] = useState('')
	const [code, setCode] = useState('')
	const [challenge, setChallenge] = useState('')
	const [busy, setBusy] = useState(false)
	const [checking, setChecking] = useState(true)
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	const [retryAt, setRetryAt] = useState(0)
	const [remaining, setRemaining] = useState(0)

	useEffect(() => {
		if (!retryAt) return
		const update = () => {
			const left = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))
			setRemaining(left)
			if (!left) setRetryAt(0)
		}
		update()
		const timer = window.setInterval(update, 1000)
		return () => window.clearInterval(timer)
	}, [retryAt])

	async function finish(record: RecordModel) {
		setOwner(record.id)
		setEmail(record.email || ''); setPassword(''); setPasswordConfirm('')
		if (!record.verified) { setScreen('verify'); return }
		try {
			const data = checkBootstrap(await getStackPocketBase().send<Bootstrap>('/api/stack/v1/bootstrap', { method: 'GET', requestKey: null }))
			if (getStackPocketBase().authStore.record?.id !== record.id) return
			setAccount(data.account)
			setScreen(data.state === 'deleting' ? 'deleting' : data.state === 'active' ? 'unlock' : 'setup')
		} catch (caught) { setScreen('connection-error'); setError(message(caught, '未能读取加密空间状态，请重试。')) }
	}
	useEffect(() => {
		if (screen !== 'deleting') return
		const timer = window.setInterval(() => {
			const record = getStackPocketBase().authStore.record
			if (record && !document.hidden) void finish(record)
		}, 30_000)
		return () => window.clearInterval(timer)
		// Poll only the pending deletion state; form input is unrelated.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [screen])
	useEffect(() => {
		const pb = getStackPocketBase()
		let previousOwner = pb.authStore.record?.id
		return pb.authStore.onChange((_token, record) => {
			if (!record || record.id !== previousOwner) {
				setOwner(''); setAccount(null); setScreen('login')
				setPassword(''); setPasswordConfirm(''); setCode(''); setChallenge('')
			}
			previousOwner = record?.id
		})
	}, [])
	useEffect(() => {
		const pb = getStackPocketBase()
		let active = true
		if (!pb.authStore.isValid) { pb.authStore.clear(); setChecking(false); return }
		void pb.collection('users').authRefresh({ requestKey: null }).then(async ({ record }) => {
			if (active) await finish(record)
		}).catch((caught: unknown) => {
			if (!active) return
			if (caught instanceof ClientResponseError && [401, 403].includes(caught.status)) pb.authStore.clear()
			else { setScreen('connection-error'); setError('暂时无法恢复登录状态，请重试。') }
		}).finally(() => { if (active) setChecking(false) })
		return () => { active = false }
		// Session restoration runs once per mount, independently of form input.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	function changeScreen(next: AuthScreen) {
		if (busy) return
		setScreen(next); setError(''); setNotice(''); setPassword(''); setPasswordConfirm(''); setCode(''); setChallenge('')
	}
	async function run(action: () => Promise<void>, fallback: string) {
		if (busy) return
		setBusy(true); setError(''); setNotice('')
		try { await action() } catch (caught) { setError(message(caught, fallback)) } finally { setBusy(false) }
	}
	async function requestCode(purpose: 'register' | 'verify') {
		const result = await getStackPocketBase().send<Challenge>('/api/stack/v1/auth/code', {
			method: 'POST', body: { purpose, email: email.trim().toLowerCase() }
		})
		if (purpose === 'register') setEmail(email.trim().toLowerCase())
		setChallenge(result.challenge); setCode(''); setRemaining(result.retry_after)
		setRetryAt(Date.now() + result.retry_after * 1000)
		setScreen(purpose === 'register' ? 'register-code' : 'verify')
		setNotice('验证码已发送，10 分钟内有效。')
	}
	function submit() {
		return run(async () => {
			const pb = getStackPocketBase()
			if (screen === 'login') {
				const { record } = await pb.collection('users').authWithPassword(email.trim(), password)
				await finish(record)
			} else if (screen === 'register') await requestCode('register')
			else if (screen === 'register-code') {
				if (password !== passwordConfirm) { setError('两次输入的密码不一致。'); return }
				await pb.send('/api/stack/v1/auth/register', { method: 'POST', body: { challenge, code, password, passwordConfirm } })
				setChallenge(''); setCode('')
				try {
					const { record } = await pb.collection('users').authWithPassword(email.trim(), password)
					await finish(record)
				} catch {
					setScreen('login'); setPassword(''); setPasswordConfirm(''); setNotice('注册已完成，请使用邮箱和密码登录。')
				}
			} else if (screen === 'verify') {
				await pb.send('/api/stack/v1/auth/verify', { method: 'POST', body: { challenge, code } })
				setChallenge(''); setCode('')
				const { record } = await pb.collection('users').authRefresh()
				await finish(record)
			} else if (screen === 'forgot') {
				await pb.collection('users').requestPasswordReset(email.trim()); setScreen('reset-sent')
			}
		}, screen === 'login' ? '邮箱或密码不正确，请重试。' : '操作未完成，请稍后重试。')
	}
	function oauth(provider: 'google' | 'github') {
		// Synchronous invocation preserves the user gesture for the SDK popup.
		return run(async () => {
			getStackPocketBase().authStore.clear()
			const { record } = await getStackPocketBase().collection('users').authWithOAuth2({ provider })
			await finish(record)
		}, '授权未完成，请重试。')
	}
	function signOut() { getStackPocketBase().authStore.clear(); changeScreen('login') }
	function retry() {
		setChecking(true)
		return run(async () => { const { record } = await getStackPocketBase().collection('users').authRefresh(); await finish(record) }, '无法恢复连接，请稍后重试。').finally(() => setChecking(false))
	}
	return { screen, owner, account, email, setEmail, password, setPassword, passwordConfirm, setPasswordConfirm, code, setCode,
		challenge, busy, checking, error, notice, remaining, changeScreen, submit, oauth, signOut, retry,
		resend: () => run(() => requestCode(screen === 'verify' ? 'verify' : 'register'), '验证码发送失败，请稍后重试。') }
}
