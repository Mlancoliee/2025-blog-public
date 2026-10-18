import { ClientResponseError } from 'pocketbase'
import { getStackPocketBase } from './pocketbase'
import type { Bootstrap } from './types'

export function stackRequest<T>(owner: string, path: string, method = 'GET', body?: unknown, signal?: AbortSignal, epoch?: string): Promise<T> {
	const pb = getStackPocketBase()
	if (!pb.authStore.isValid || pb.authStore.record?.id !== owner) return Promise.reject(new Error('登录状态已变化，请重新登录。'))
	const controller = new AbortController()
	const abort = () => controller.abort()
	if (signal?.aborted) abort()
	else signal?.addEventListener('abort', abort, { once: true })
	const timer = setTimeout(abort, 30_000)
	// Keep drafts in memory on expiry so the user can export them before logging out.
	return pb.send<T>(`/api/stack/v1${path}`, { method, body, signal: controller.signal, headers: epoch ? { 'X-Inkstack-Epoch': epoch } : {}, requestKey: null })
		.finally(() => { clearTimeout(timer); signal?.removeEventListener('abort', abort) })
}

export function checkBootstrap(data: Bootstrap): Bootstrap {
	if (data.protocol?.version !== 1 || !['active', 'empty', 'deleting'].includes(data.state) ||
		!['operation_receipts', 'sync_epochs', 'encrypted_attachments', 'read_only_api_keys'].every(name => data.capabilities?.[name]) ||
		(data.state === 'active' ? !data.account || !/^[A-Za-z0-9]{32}$/.test(data.account.sync_epoch) : data.account !== null)) {
		throw new Error('服务端版本尚未就绪，请完成墨栈后端更新后重新连接。')
	}
	return data
}

export function stackError(error: unknown): string {
	if (error instanceof ClientResponseError) {
		const code = error.response?.error?.code
		const messages: Record<string, string> = {
			sync_reset_required: '空间已恢复或重新创建。请先导出未保存草稿，再锁定并重新解锁。',
			not_initialized: '远端空间已清空。请先导出未保存草稿，再重新连接。',
			data_deletion_pending: '空间正在清理，完成后才能重新初始化。',
			operation_limit: '今日保存次数已达上限，草稿已保留，请稍后重试。',
			operation_conflict: '保存凭据发生冲突，草稿已保留，请导出后重新连接。',
			invalid_attachment_reference: '附件引用已失效，原内容已保留，请重新同步。',
			account_limit: '空间已达 100 MiB，请永久删除不需要的笔记后重试。',
			item_limit: '已达条目上限，无法新建笔记。',
			api_key_limit: '最多保存 20 个访问 Key，请撤销旧 Key 后重试。',
			keyring_conflict: '另一台设备已修改加密设置，请锁定空间并重新解锁。',
			already_initialized: '空间已在其他设备初始化，请重新连接并解锁。'
		}
		if (messages[code]) return messages[code]
		if (error.status === 0) return '网络连接失败。未保存内容仍在当前标签页，请保持页面打开后重试。'
		if (error.status === 401) return '登录已过期，请重新登录。'
		if (error.status === 429) return '请求较多，请稍后重试。'
		if (error.status === 404) return '接口或记录不存在，请确认后端已部署对应版本。'
		return '操作未完成，请重试。'
	}
	return error instanceof Error ? error.message : '操作未完成，请重试。'
}
