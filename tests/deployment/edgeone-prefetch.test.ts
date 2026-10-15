import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { matchHas, prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination'
import { prepareEdgeOnePrefetch } from '../../scripts/prepare-edgeone-prefetch.mjs'

const directories: string[] = []
afterEach(async () => {
	await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture(buildId = 'test-build', hints = 4112) {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'edgeone-prefetch-'))
	directories.push(directory)
	const write = async (name: string, content: string | Buffer) => {
		await mkdir(path.dirname(path.join(directory, name)), { recursive: true })
		await writeFile(path.join(directory, name), content)
	}
	await write('BUILD_ID', 'test-build\n')
	await write('prerender-manifest.json', JSON.stringify({ routes: {
		'/': { initialRevalidateSeconds: false, dataRoute: '/index.rsc' },
		'/new-page': { initialRevalidateSeconds: false, dataRoute: '/new-page.rsc' },
		'/news': { initialRevalidateSeconds: 60, dataRoute: '/news.rsc' },
		'/api/status': { initialRevalidateSeconds: false, dataRoute: null },
		'/_not-found': { initialRevalidateSeconds: false, initialStatus: 404, dataRoute: '/_not-found.rsc' }
	} }))
	await write('routes-manifest.json', JSON.stringify({
		headers: [{ source: '/images/:path*', headers: [{ key: 'X-Existing', value: 'kept' }] }],
		rewrites: { beforeFiles: [], afterFiles: [{ source: '/old', destination: '/new' }], fallback: [] },
		redirects: [{ source: '/zh', destination: '/' }]
	}))
	const tree = `0:${JSON.stringify({ buildId, staleTime: 300, tree: { prefetchHints: hints } })}\n`
	for (const key of ['index', 'new-page']) {
		await write(`server/app/${key}.segments/_tree.segment.rsc`, tree)
		await write(`server/app/${key}.segments/!KGhvbWUp/__PAGE__.segment.rsc`, Buffer.from([0, 1, 128, 255]))
	}
	return directory
}

async function readManifest(directory: string) {
	return JSON.parse(await readFile(path.join(directory, 'routes-manifest.json'), 'utf8'))
}

function destination(manifest: Awaited<ReturnType<typeof readManifest>>, pathname: string, headers: Record<string, string>) {
	for (const rewrite of manifest.rewrites.beforeFiles) {
		if (!new RegExp(rewrite.regex).test(pathname)) continue
		const params = matchHas({ headers } as Parameters<typeof matchHas>[0], {}, rewrite.has)
		if (params) return prepareDestination({ destination: rewrite.destination, params, query: {}, appendParamsToQuery: false }).newUrl
	}
	return null
}

describe('EdgeOne segment prefetch deployment', () => {
	it('serves the original tree and encoded homepage segment through Next header matching', async () => {
		const directory = await fixture()
		expect(await prepareEdgeOnePrefetch(directory)).toBe(2)
		const manifest = await readManifest(directory)
		for (const segment of ['/_tree', '/!KGhvbWUp/__PAGE__']) {
			const target = destination(manifest, '/', { rsc: '1', 'next-router-segment-prefetch': segment })!
			expect(target).toBe(`/_next/static/test-build/edgeone-prefetch/index${segment}.segment.rsc`)
			const copied = path.join(directory, 'static', target.slice('/_next/static/'.length))
			const original = path.join(directory, `server/app/index.segments${segment}.segment.rsc`)
			expect(await readFile(copied)).toEqual(await readFile(original))
		}
		const response = manifest.headers.find((entry: { source: string }) => entry.source === '/')
		expect(response.headers).toEqual(expect.arrayContaining([
			{ key: 'Content-Type', value: 'text/x-component' }, { key: 'X-Nextjs-Postponed', value: '2' }
		]))
	})

	it('automatically covers new static pages while preserving ordinary navigation and other routes', async () => {
		const directory = await fixture()
		await prepareEdgeOnePrefetch(directory)
		const manifest = await readManifest(directory)
		const headers = { rsc: '1', 'next-router-segment-prefetch': '/_tree' }
		expect(destination(manifest, '/new-page', headers)).toContain('/new-page/_tree.segment.rsc')
		for (const route of ['/news', '/api/status', '/account', '/_not-found']) expect(destination(manifest, route, headers)).toBeNull()
		const requests: Record<string, string>[] = [{}, { rsc: '1' }, { 'next-router-segment-prefetch': '/_tree' }, { rsc: '1', 'next-router-segment-prefetch': '/../secret' }]
		for (const request of requests) {
			expect(destination(manifest, '/', request)).toBeNull()
		}
		expect(manifest.rewrites.afterFiles).toEqual([{ source: '/old', destination: '/new' }])
		expect(manifest.redirects).toEqual([{ source: '/zh', destination: '/' }])
		expect(manifest.headers[0].source).toBe('/images/:path*')
	})

	it.each([{ buildId: 'another-build', hints: 4112 }, { buildId: 'test-build', hints: 4624 }])('rejects mismatched or stale trees ($buildId, $hints)', async ({ buildId, hints }) => {
		const directory = await fixture(buildId, hints)
		await expect(prepareEdgeOnePrefetch(directory)).rejects.toThrow('Invalid prefetch tree')
		expect((await readManifest(directory)).rewrites.beforeFiles).toEqual([])
	})
})
