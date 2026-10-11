# Content And Reading

## Purpose

Owns repository-managed pages: blog Markdown, article metadata, images, Markdown rendering, reading UI, news, and likes.

## Key Paths

| Path | Use it for |
| --- | --- |
| `public/blogs/<slug>/config.json` + `index.md` | One article's metadata and body. |
| `public/blogs/index.json` | Blog list metadata. |
| `public/blogs/word-cloud.json` | Generated word-cloud output. |
| `src/app/blog/` | Blog list/detail routes. |
| `public/about.md`, `src/app/about/`, `src/app/changelog/`, `src/app/api/changelog/` | Site introduction, changelog entry point, dated history, and lazy-load batches. |
| `src/lib/load-blog.ts` | Article fetch/cache. |
| `src/hooks/use-markdown-render.tsx` + `src/lib/markdown-renderer.ts` | Worker/main-thread Markdown pipeline. |
| `src/components/blog-preview.tsx` | Article reading shell. |
| `src/lib/news.ts`, `src/lib/english-reading.ts`, `src/app/api/newsnow/` | News, English-reading, and live-focus data normalization. |
| `src/app/news/english-reading/` | English-reading list and detail routes. |
| `src/components/english-reading/`, `src/lib/reading-translation/` | Reading gestures, responsive translation panel, browser model transport, and browser-persisted model configuration. |
| `supabase/functions/like/`, `supabase/migrations/` | Like endpoint and data model. |

## Main Flow

The index fetches `index.json`; an article fetches its paired JSON/Markdown files. Markdown normally renders in a Worker, then becomes TOC, lazily loaded Shiki code blocks, Mermaid placeholders, safe links, and shared image preview. News handlers normalize remote sources. The news landing page uses one data-driven feature card with explicit daily/English selectors plus optional drag animation; it does not auto-rotate or render hidden sizing copies. News and English-reading archives use server-side query pagination so the browser receives only one page of cards. English reading uses `news/english-reading/list.json` as the title and audio metadata source of truth, and a detail must have both an index entry and matching Markdown. The NewsNow focus card is collapsed by default and loads its live feed only when opened. Dated news details load through `getNewsArticle()` as Server Components and keep probing optional audio through the shared player. Likes call the external Supabase function.

## Pay Attention

- `/about` renders its small Markdown body on the main thread via `useMarkdownRender(..., { worker: false })`. It does not need the Worker startup or its extra script requests; this also avoids the observed development-time `importScripts` loading failure. Other Markdown consumers keep their existing Worker policy.
- `/about` links to the standalone `/changelog` below its subtitle. Maintain text-only updates in `src/app/changelog/entries/`, split by year/half-year to keep files small. Use unique ISO dates in descending order, a title, and typed changes. The archive traces the complete local Git history from the initial repository snapshot on 2025-11-16 through 2026-10-11 (108 date groups at the current backfill). These are commit dates, not verified deployment dates. Group related commits and retain representative hashes in source comments; do not publish raw commit messages or turn Git into an automatic feed. Entries describe changes without tool-opening links, other page destinations, or images.
- Keep experimental history too: mark individual changes with `beta: true`, and use `outcome: 'removed' | 'reverted'` only when follow-up commits confirm that result. Explain when a trial ended; do not label a retained feature as removed. Experimental notes share the normal timeline, with small Beta/outcome badges. Pure test fixtures, documentation-only edits, repeated content saves, and temporary rollback/restore chains do not need separate releases.
- `entries.ts` is server-only. The page renders the first ten date groups and a compact date index; `/api/changelog?before=YYYY-MM-DD` supplies the next ten older groups using the last loaded date as a cursor. The endpoint rejects unknown cursors. The archive is a continuous feed, not paginated navigation: append entries without replacing earlier DOM, changing the URL, or moving the reader's scroll position. Do not restore page controls or eagerly download the full archive.
- `use-changelog-feed.ts` loads another batch when its sentinel is within 700px below the viewport. Allow only one request at a time, abort on unmount, and pause automatic loading after a failure until the reader retries. Year links and direct date hashes load intervening batches before scrolling to the requested entry, keeping the timeline continuous.
- The timeline uses memoized entries and `content-visibility: auto` with remembered intrinsic height on entry bodies to skip offscreen rendering without removing readable history. Keep the rail outside that containment so connecting segments are not clipped; date targets render their body immediately. A separate IntersectionObserver runs each entry animation once, then unobserves it. Keep the full archive out of client imports and serialized initial props. Text remains visible before hydration and when reduced motion is requested.
- Changelog colors inherit the root time-theme variables and atmosphere; use the existing global theme picker. Center the header's label, title, and description across the full page content width on desktop and mobile, without the timeline's content inset. The straight rail, nodes, and halos share `--axis-x` and `--node-y`, with CSS segments stretching to the next entry. Keep the 400 ms text entrance, bounded stagger, and one-shot halo; do not add idle animation loops or replay entries on theme changes. Mobile dates sit above the text, and all controls remain keyboard accessible.
- Keep article JSON, Markdown, index, generated word cloud, and image paths in sync. The article index uses one HTTP cache policy: 10 minutes, then mandatory revalidation; do not add client-side persistent caching for it.
- Blog detail is client-rendered; do not assume server-rendered article HTML.
- English-reading details opt into `BlogPreview.enableTranslation`. Its reader indexes existing text nodes with `Intl.Segmenter`, uses caret hit testing and CSS Custom Highlights, and never wraps every word in React components. Desktop drag uses native selection; touch taps translate a word, while a 350 ms hold starts custom phrase selection. Movement over 8 px before the hold yields to native scrolling. Browsers without CSS Custom Highlights retain native touch selection and use the selection toolbar instead of invisible custom dragging. Keep touchmove non-passive only on the reader; changing touch-action during a gesture cannot claim it. Cancelled/multitouch gestures must not submit translations. Alt+Enter and the selection toolbar provide a keyboard path.
- Translation panels are portaled outside the article's overflow clip. Desktop uses a range-anchored popover; screens at or below 768 px use a content-height bottom sheet capped at 68% of the visual viewport, with safe-area padding, internal scrolling, keyboard avoidance, and a dismiss handle. Normal article scrolling remains available.
- Translation selection, controls, panel surfaces, inputs, and status colors derive from the root time-theme variables. Because the panel portal mounts under `body`, keep theme variables on `html` and do not replace them with reader-scoped custom properties that the portal cannot inherit.
- Keep the named `::highlight(english-reading-selection)` rule in the reader's plain runtime `<style>` element. The current Turbopack CSS-module parser rejects this pseudo-element even though the reader targets browsers that implement Custom Highlights. Do not move it back into the CSS module or styled-jsx.
- The reader persists its user-supplied HTTPS Chat Completions endpoint and model in origin-scoped `localStorage`. It encrypts the API key with AES-GCM using an origin-scoped, non-extractable Web Crypto key kept in IndexedDB. The configuration is shared across English-reading articles until the user clears it. This protects the key at rest but cannot isolate it from same-origin script execution; keep credentials out of server-rendered props, article markup, and logs. Browser CORS support is required; there is no translation proxy or built-in platform key.
- The model client sends only selected text, its bounded context, and article title. Words request validated JSON context meanings; passages stream plain text. Requests have cancellation, stale-result guards, a 30-second timeout, a 1600-character selection limit, and a 100-entry memory cache keyed by text, context, model, endpoint, and prompt version. Do not cache errors or partial streams; browser cancellation does not guarantee provider billing cancellation.
- The translation-enabled renderer uses an explicit inert element/attribute vocabulary (`reading-html.tsx`) before mounting content: active HTML, embedded documents, arbitrary attributes, and unsafe URL schemes are omitted. HTTP(S) Markdown images keep the existing preview component. Ordinary blog rendering is unchanged. Model output is rendered as text, never injected as HTML. This reading mode intentionally does not mount Mermaid or interactive raw HTML.
- Sidebar must remain native sticky; progress must use cached scroll range and observe the actual content wrapper so async rendering can invalidate it; code containment needs measured height.
- Source images belong in sibling `2025-blog-img`, not newly under this repo's `public/`.
- Do not manually edit generated `word-cloud.json`; use its script when generation is requested.
- `sitemap.xml` and `robots.txt` directories are not implemented routes.
