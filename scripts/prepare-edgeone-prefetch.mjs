import { cp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildCustomRoute } from 'next/dist/lib/build-custom-route.js'

// EdgeOne's static RSC routing does not publish Next's per-segment responses.
// Adapt the completed build so routes and files always use the same build ID.
export async function prepareEdgeOnePrefetch(buildDirectory = '.next') {
	const readJson = async name => JSON.parse(await readFile(path.join(buildDirectory, name), 'utf8'))
	const buildId = (await readFile(path.join(buildDirectory, 'BUILD_ID'), 'utf8')).trim()
	const prerender = await readJson('prerender-manifest.json')
	const manifest = await readJson('routes-manifest.json')
	const assetPrefix = `/_next/static/${buildId}/edgeone-prefetch`
	const rewrites = []
	const headers = []

	for (const [route, entry] of Object.entries(prerender.routes)) {
		// Only immutable, public build output can be served as static segments.
		if (route.startsWith('/_') || entry.initialRevalidateSeconds !== false ||
			(entry.initialStatus ?? 200) !== 200 || !entry.dataRoute?.endsWith('.rsc')) continue

		const routeKey = entry.dataRoute.slice(1, -4)
		const segmentDirectory = path.join(buildDirectory, 'server/app', `${routeKey}.segments`)
		const treeBody = await readFile(path.join(segmentDirectory, '_tree.segment.rsc'), 'utf8')
		const treeLine = treeBody.split('\n').find(line => line.startsWith('0:'))
		const tree = treeLine && JSON.parse(treeLine.slice(2))
		if (!tree?.tree || tree.buildId !== buildId || (tree.tree.prefetchHints & 512) !== 0) {
			throw new Error(`Invalid prefetch tree for ${route}; review the Next.js segment protocol`)
		}

		const has = [
			{ type: 'header', key: 'rsc', value: '1' },
			// "!" occurs in encoded route groups such as the homepage's (home).
			// Allow segment keys and separators, but never dot/path traversal syntax.
			{ type: 'header', key: 'next-router-segment-prefetch', value: '/(?<segment>[A-Za-z0-9_!@$~-]+(?:/[A-Za-z0-9_!@$~-]+)*)' }
		]
		const source = route.replace(/[():*+?{}\\]/g, '\\$&')
		rewrites.push(buildCustomRoute('rewrite', {
			source, has, destination: `${assetPrefix}/${routeKey}/:segment.segment.rsc`
		}))
		headers.push(buildCustomRoute('header', {
			source, has, headers: [
				{ key: 'Content-Type', value: 'text/x-component' },
				{ key: 'X-Nextjs-Postponed', value: '2' },
				{ key: 'X-Nextjs-Stale-Time', value: String(tree.staleTime) },
				{ key: 'Vary', value: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch' },
				{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }
			]
		}))
		await cp(segmentDirectory, path.join(buildDirectory, 'static', buildId, 'edgeone-prefetch', routeKey), { recursive: true })
	}

	// These are standard Next routes; EdgeOne reads this manifest after build.
	manifest.rewrites.beforeFiles.unshift(...rewrites)
	manifest.headers.push(...headers)
	await writeFile(path.join(buildDirectory, 'routes-manifest.json'), JSON.stringify(manifest))
	return rewrites.length
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const routes = await prepareEdgeOnePrefetch()
	console.log(`Prepared Next.js prefetch segments for ${routes} static routes`)
}
