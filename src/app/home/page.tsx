import type { Metadata } from 'next'
import StackLogin from './stack-login'

export const metadata: Metadata = {
	title: '墨栈 - WinriseF',
	description: '登录墨栈，管理笔记。'
}

export default function StackLoginPage() {
	return <StackLogin />
}
