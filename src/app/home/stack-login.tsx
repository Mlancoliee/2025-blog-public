'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, PenLine, ShieldCheck, Github } from 'lucide-react'
import { useTimeTheme } from '@/components/time-theme-provider'
import { getAssetUrl } from '@/lib/asset-url'
import { useStackAuth, type AuthScreen } from '@/lib/stack/use-stack-auth'
import styles from './stack-login.module.css'
import { VaultGate } from './vault-gate'
import StackWorkspace from './stack-workspace'
import type { StackAccount } from '@/lib/stack/types'

const copy: Record<AuthScreen, [string, string]> = {
	login: ['欢迎回来', '让每一个想法，都有自己的位置。'],
	register: ['创建你的墨栈', '从验证邮箱开始，留住下一次灵感。'],
	'register-code': ['验证邮箱', '输入邮件中的验证码，并设置登录密码。'],
	verify: ['验证你的邮箱', '完成邮箱验证，继续访问私人空间。'],
	forgot: ['找回登录密码', '我们会向你的邮箱发送重置链接。'],
	'reset-sent': ['请查收邮件', '如果该邮箱已注册，你将收到重置链接。'],
	setup: ['开启私人空间', '邮箱已验证，你还没有设置加密口令。'],
	unlock: ['你的空间已锁定', '账户已登录，文字需要独立的加密口令解锁。'],
	deleting: ['正在清理空间', '文件清理完成后，你可以重新开启墨栈。'],
	'connection-error': ['连接暂时中断', '请重试，或退出当前账户后重新登录。']
}

function GoogleIcon() {
	return <svg viewBox='0 0 24 24' width='20' height='20' aria-hidden='true'>
		<path fill='#4285F4' d='M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.23c1.89-1.74 2.99-4.3 2.99-7.36Z'/>
		<path fill='#34A853' d='M12 22c2.7 0 4.96-.9 6.61-2.41l-3.23-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.07v2.59A10 10 0 0 0 12 22Z'/>
		<path fill='#FBBC05' d='M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.33-2.59Z'/>
		<path fill='#EA4335' d='M12 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.33 2.59c.79-2.36 3-4.12 5.6-4.12Z'/>
	</svg>
}

export default function StackLogin() {
	const { theme } = useTimeTheme()
	const auth = useStackAuth()
	// Private auth UI uses the browser's shared theme after hydration.
	const [mounted, setMounted] = useState(false)
	useEffect(() => setMounted(true), [])
	const [showPassword, setShowPassword] = useState(false)
	const [unlocked, setUnlocked] = useState<{ owner: string; key: Uint8Array; account: StackAccount } | null>(null)
	useEffect(() => () => { unlocked?.key.fill(0) }, [unlocked])
	useEffect(() => { if (unlocked && unlocked.owner !== auth.owner) setUnlocked(null) }, [auth.owner, unlocked])
	const { screen, busy } = auth
	const [title, subtitle] = copy[screen]
	const formScreen = ['login', 'register', 'register-code', 'verify', 'forgot'].includes(screen)
	const codeScreen = screen === 'register-code' || screen === 'verify'
	const passwordScreen = screen === 'login' || screen === 'register-code'
	const spaceScreen = screen === 'setup' || screen === 'unlock'
	if (!mounted) return null
	if (unlocked && unlocked.owner === auth.owner) return <StackWorkspace owner={auth.owner} email={auth.email} dataKey={unlocked.key} epoch={unlocked.account.sync_epoch} onLock={() => { setUnlocked(null); void auth.retry() }} onSignOut={() => { setUnlocked(null); auth.signOut() }}/>

	return (
		<section className={styles.page} data-theme={theme.name} lang='zh-CN'>
			<div className={styles.background} style={{ backgroundImage: `url("${getAssetUrl(`/images/project/mo-stack/login-backgrounds/${theme.name}.png`)}")` }} aria-hidden='true' />
			<Link href='/' className={styles.backLink}><ArrowLeft size={16} /> 返回网站</Link>
			<div className={styles.stage}>
				<article className={styles.card} aria-labelledby='stack-heading'>
					<div className={styles.brand}><span className={styles.brandIcon}><PenLine size={24} strokeWidth={1.7}/></span><span>墨栈</span><span className={styles.brandEnglish}>INKSTACK</span></div>
					<header className={styles.intro}><h1 id='stack-heading'>{title}</h1><p>{subtitle}</p></header>
					{auth.checking ? <div className={styles.state} role='status'>正在恢复登录状态…</div> : <>
						{formScreen && <form className={styles.form} onSubmit={event => { event.preventDefault(); void auth.submit() }}>
							<fieldset disabled={busy}>
								{!codeScreen ? <label className={styles.field}><span>邮箱地址</span><div className={styles.inputWrap}><Mail size={18}/><input name='email' type='email' autoComplete='email' placeholder='you@example.com' required maxLength={254} value={auth.email} onChange={e => auth.setEmail(e.target.value)}/></div></label> :
									<div className={styles.emailSummary}><Mail size={16}/><span>{auth.email}</span>{screen === 'register-code' && <button type='button' onClick={() => auth.changeScreen('register')}>修改</button>}</div>}
								{codeScreen && <label className={styles.field}><span>邮箱验证码</span><div className={styles.inputWrap}><input className={styles.codeInput} name='code' inputMode='numeric' autoComplete='one-time-code' pattern='[0-9]{6}' maxLength={6} placeholder='6 位验证码' required value={auth.code} onChange={e => auth.setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}/><button className={styles.sendCode} type='button' disabled={busy || auth.remaining > 0} onClick={() => void auth.resend()}>{auth.remaining > 0 ? `${auth.remaining}s 后重发` : auth.challenge ? '重新发送' : '发送验证码'}</button></div></label>}
								{passwordScreen && <label className={styles.field}><span>登录密码{screen === 'login' && <button type='button' onClick={() => auth.changeScreen('forgot')}>忘记密码？</button>}</span><div className={styles.inputWrap}><LockKeyhole size={18}/><input name='password' type={showPassword ? 'text' : 'password'} autoComplete={screen === 'login' ? 'current-password' : 'new-password'} placeholder={screen === 'login' ? '输入你的密码' : '至少 8 位字符'} required minLength={screen === 'login' ? undefined : 8} maxLength={128} value={auth.password} onChange={e => auth.setPassword(e.target.value)}/><button type='button' className={styles.eye} aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>}
								{screen === 'register-code' && <label className={styles.field}><span>确认密码</span><div className={styles.inputWrap}><LockKeyhole size={18}/><input name='passwordConfirm' type={showPassword ? 'text' : 'password'} autoComplete='new-password' placeholder='再次输入登录密码' required minLength={8} maxLength={128} value={auth.passwordConfirm} onChange={e => auth.setPasswordConfirm(e.target.value)}/></div></label>}
								<button className={styles.primary} type='submit' disabled={busy || (codeScreen && !auth.challenge)}>{busy ? '正在处理…' : screen === 'login' ? '登录' : screen === 'register' ? '发送注册验证码' : screen === 'register-code' ? '验证并创建账户' : screen === 'verify' ? '验证并继续' : '发送重置链接'}{!busy && <ArrowRight size={17}/>}</button>
							</fieldset>
						</form>}
						{screen === 'login' && <><div className={styles.divider}>或使用以下方式继续</div><div className={styles.providers}><button type='button' disabled={busy} onClick={() => void auth.oauth('github')}><Github size={20}/>GitHub</button><button type='button' disabled={busy} onClick={() => void auth.oauth('google')}><GoogleIcon/>Google</button></div><p className={styles.switchMode}>还没有账户？ <button disabled={busy} onClick={() => auth.changeScreen('register')}>立即注册</button></p></>}
						{['register', 'register-code', 'forgot', 'reset-sent'].includes(screen) && <p className={styles.switchMode}><button disabled={busy} onClick={() => auth.changeScreen('login')}>返回登录</button></p>}
						{screen === 'forgot' && <p className={styles.hint}>登录密码重置不会更改你的加密口令。</p>}
						{screen === 'reset-sent' && <div className={styles.state}><Mail size={32}/><span>{auth.email}</span><p>请检查收件箱和垃圾邮件文件夹。</p></div>}
						{spaceScreen && <VaultGate key={`${auth.owner}:${screen}:${auth.account?.key_revision ?? 0}`} owner={auth.owner} account={auth.account} onUnlock={(key, account) => setUnlocked({ owner: auth.owner, key, account })}/>}
						{screen === 'deleting' && <div className={styles.state} role='status'><p>正在清理附件，每 30 秒自动检查一次。请勿重复初始化。</p><button type='button' className={styles.secondary} disabled={busy} onClick={() => void auth.retry()}>检查进度</button></div>}
						{screen === 'connection-error' && <button className={styles.primary} disabled={busy} onClick={() => void auth.retry()}>重新连接</button>}
						{(spaceScreen || screen === 'deleting' || screen === 'verify' || screen === 'connection-error') && <p className={styles.switchMode}><button disabled={busy} onClick={auth.signOut}>退出当前账户</button></p>}
						<div className={styles.feedback} aria-live='polite'>{auth.error ? <p className={styles.error} role='alert'>{auth.error}</p> : auth.notice ? <p>{auth.notice}</p> : null}</div>
					</>}
					<footer className={styles.footer}><ShieldCheck size={14}/><span>私人文字空间 · 端到端加密</span></footer>
				</article>
			</div>
		</section>
	)
}
