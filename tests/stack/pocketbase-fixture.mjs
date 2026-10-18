import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'

export async function stopProcess(child) {
	if (!child || child.exitCode !== null || child.signalCode !== null) return
	const exited = new Promise(resolve => child.once('exit', resolve))
	child.kill('SIGTERM')
	const timeout = setTimeout(() => child.kill('SIGKILL'), 3000)
	await exited; clearTimeout(timeout)
}

// Disposable, local-only backend shared by contract and browser tests.
export async function startPocketBase(archive) {
	const directory = mkdtempSync(join(tmpdir(), 'inkstack-test-'))
	const email = 'user@example.test', password = 'Disposable-Contract-Test-Only-2026'
	let service, token = ''
	const close = async () => { await stopProcess(service); rmSync(directory, { recursive: true, force: true }) }
	try {
		execFileSync('tar', ['-xzf', archive, '-C', directory])
		const binary = join(directory, readdirSync(directory)[0], 'pocketbase'), data = join(directory, 'data')
		execFileSync(binary, ['superuser', 'create', 'admin@example.test', password, '--dir', data], { stdio: 'ignore' })
		const probe = createServer()
		await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
		const port = probe.address().port
		await new Promise(resolve => probe.close(resolve))
		const url = `http://127.0.0.1:${port}`
		service = spawn(binary, ['serve', '--http', `127.0.0.1:${port}`, '--dir', data], { stdio: 'ignore' })
		for (let i = 0; i < 100; i++) {
			if (await fetch(url + '/api/health').then(r => r.ok).catch(() => false)) break
			await new Promise(resolve => setTimeout(resolve, 50))
		}
		async function json(path, method = 'GET', body, auth = token) {
			const response = await fetch(url + path, { method, headers: { 'Content-Type': 'application/json', Authorization: auth }, body: body === undefined ? undefined : JSON.stringify(body) })
			const result = await response.json()
			if (!response.ok) throw Object.assign(new Error(`Fixture request failed (${response.status})`), { status: response.status, response: result })
			return result
		}
		let admin
		try { admin = await json('/api/collections/_superusers/auth-with-password', 'POST', { identity: 'admin@example.test', password }, '') }
		catch (error) {
			if (!error.response?.mfaId) throw error
			// Respect snapshot MFA; CLI OTP creates no mail or external traffic.
			const otp = execFileSync(binary, ['superuser', 'otp', 'admin@example.test', '--dir', data], { encoding: 'utf8' })
			admin = await json('/api/collections/_superusers/auth-with-otp', 'POST', { otpId: otp.match(/Id:\s+(\w+)/)?.[1], password: otp.match(/Pass:\s+(\d+)/)?.[1], mfaId: error.response.mfaId }, '')
		}
		const user = await json('/api/collections/users/records', 'POST', { email, password, passwordConfirm: password, verified: true }, admin.token)
		token = (await json('/api/collections/users/auth-with-password', 'POST', { identity: email, password }, '')).token
		return { url, owner: user.id, token, email, password, close }
	} catch (error) { await close(); throw error }
}
