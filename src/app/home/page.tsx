import type { Metadata } from 'next'
import StackLogin from './stack-login'

export const metadata: Metadata = {
	title: '墨栈 · 私人文字空间 - WinriseF',
	description: '登录墨栈，访问只由你解锁的私人文字空间。'
}

export default function StackLoginPage() {
	return <StackLogin />
}
