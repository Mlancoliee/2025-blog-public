import assert from 'node:assert/strict'
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'

// Browser capacity exercise: synthetic ciphertext, never a production account.
export async function checkScale(page, fixture, passphrase, output) {
	await page.setViewportSize({ width: 1440, height: 1000 })
	await page.getByRole('button', { name: '访问与安全', exact: true }).first().click()
	await page.getByRole('button', { name: '加密设置', exact: true }).click()
	await page.getByRole('button', { name: '显示数据密钥', exact: true }).click()
	const key = Buffer.from(await page.getByLabel('账户数据密钥', { exact: true }).inputValue(), 'base64url')
	await page.getByRole('button', { name: '关闭', exact: true }).click()
	const bootstrap = await fetch(fixture.url + '/api/stack/v1/bootstrap', { headers: { Authorization: fixture.token } }).then(r => r.json())
	const epoch = bootstrap.account.sync_epoch
	const records = []
	try {
		for (let index = 0; index < 50000; index++) {
			const id = randomUUID(), nonce = randomBytes(12)
			const cipher = createCipheriv('aes-256-gcm', key, nonce)
			cipher.setAAD(Buffer.from('stack:v1:item:' + fixture.owner + ':' + id + ':1'))
			const content = { schema: 1, kind: 'note', format: 'markdown', folder_id: null, attachments: [], title: 'Load note ' + String(index).padStart(5, '0'), body: 'Synthetic private note ' + index + '\n' + 'x'.repeat(1536), tags: ['容量测试'], favorite: index % 10 === 0, trashed: false }
			const encrypted = Buffer.concat([cipher.update(JSON.stringify(content)), cipher.final(), cipher.getAuthTag()])
			records.push({ item_id: id, protocol_version: 1, revision: 1, change_sequence: index + 1, nonce: nonce.toString('base64url'), ciphertext: encrypted.toString('base64url'), attachment_ids: [], deleted: false, created: '2026-10-11T00:00:00Z', updated: '2026-10-11T00:00:00Z' })
		}
	} finally { key.fill(0) }
	let count = 0
	await page.route('**/api/stack/v1/sync?*', route => {
		const since = Number(new URL(route.request().url()).searchParams.get('since'))
		const end = Math.min(count, since + 100)
		return route.fulfill({ json: { owner_id: fixture.owner, sync_epoch: epoch, items: records.slice(since, end), next_cursor: Math.max(since, end), has_more: end < count } })
	})
	await page.route('**/api/stack/v1/items/**', route => {
		if (route.request().method() !== 'PUT') return route.fallback()
		const body = route.request().postDataJSON()
		const id = new URL(route.request().url()).pathname.split('/').at(-1)
		const revision = body.base_revision + 1, now = new Date().toISOString()
		return route.fulfill({ json: { sync_epoch: epoch, replayed: false, item: { ...body, item_id: id, revision, change_sequence: count + 1, deleted: false, created: now, updated: now }, operation: { operation_id: body.operation_id, item_id: id, revision, change_sequence: count + 1, deleted: false, expires: Date.now() + 86400000 } } })
	})
	await page.addInitScript(() => {
		window.__inkstackLongTasks = []
		new PerformanceObserver(list => window.__inkstackLongTasks.push(...list.getEntries().map(entry => entry.duration))).observe({ type: 'longtask', buffered: true })
	})
	const cdp = await page.context().newCDPSession(page)
	const metrics = []
	for (count of [5000, 50000]) {
		await page.reload()
		const started = Date.now()
		await page.locator('input[name=encryption-passphrase]').fill(passphrase)
		await page.getByRole('button', { name: '解锁空间', exact: true }).click()
		await page.waitForFunction(expected => document.querySelector('[aria-label="笔记列表"] h1 small')?.textContent === String(expected), count, { timeout: 180000 })
		const unlockMs = Date.now() - started
		await page.locator('[class*="noteRow"]').first().click()
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
		const latencies = []
		await page.getByLabel('笔记正文', { exact: true }).focus()
		for (let index = 0; index < 20; index++) {
			const before = Date.now()
			await page.keyboard.insertText('字')
			await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
			latencies.push(Date.now() - before)
		}
		latencies.sort((a, b) => a - b)
		const searchStart = Date.now()
		await page.getByLabel('搜索笔记', { exact: true }).fill('Load note ' + String(count - 1).padStart(5, '0'))
		await page.getByText('Load note ' + String(count - 1).padStart(5, '0'), { exact: true }).click()
		const searchMs = Date.now() - searchStart
		assert.equal(await page.getByLabel('笔记标题', { exact: true }).inputValue(), 'Load note ' + String(count - 1).padStart(5, '0'))
		await page.getByLabel('搜索笔记', { exact: true }).fill('')
		await page.waitForFunction(expected => document.querySelector('[aria-label="笔记列表"] h1 small')?.textContent === String(expected), count)
		const renderedRows = await page.locator('[class*="noteRow"]').count()
		await page.getByRole('button', { name: '保存到墨栈', exact: true }).click().catch(() => {})
		await page.waitForTimeout(1500)
		const heap = await cdp.send('Runtime.getHeapUsage')
		const longTasks = await page.evaluate(() => window.__inkstackLongTasks)
		metrics.push({ notes: count, ciphertextMiB: Math.round(records.slice(0, count).reduce((sum, row) => sum + Buffer.byteLength(row.ciphertext, 'base64url'), 0) / 1048576), unlockMs, inputMedianMs: latencies[10], inputP95Ms: latencies[18], searchMs, renderedRows, heapMiB: Math.round(heap.usedSize / 1048576), longestTaskMs: Math.round(Math.max(0, ...longTasks)) })
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
		writeFileSync(output + '/scale.json', JSON.stringify(metrics, null, 2))
		console.log('SCALE: ' + JSON.stringify(metrics.at(-1)))
	}
	await cdp.detach()
}
