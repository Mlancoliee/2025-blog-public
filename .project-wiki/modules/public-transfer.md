# Public Encrypted Transfer

## Purpose

Owns the password-protected EdgeOne relay at `/t`, including encrypted chunk lifecycle, administration, and cleanup. It is separate from [LAN transfer](./lan-transfer.md).

## Key Paths

| Path | Use it for |
| --- | --- |
| `src/app/t/` | Public create/read/status UI. |
| `src/lib/transfer-crypto.ts` | Browser encryption/key derivation. |
| `src/lib/transfer-relay.ts` | Relay client flow. |
| `src/lib/transfer-download-storage.ts` | Browser-private disk storage and temporary-file cleanup for large downloads. |
| `src/lib/transfer-stats.ts` | Merge paginated admin statistics and retain global largest objects. |
| `edge-functions/api/transfer/` | Create, complete, meta, open, stats, cleanup API. |
| `edge-functions/api/transfer/cleanup.js` | Bounded deletion pages shared by manual cleanup and the scheduled worker. |
| `cloud-functions/api/transfer-cleanup.js` | Node.js scheduled cleanup worker, independent of the Edge Fetch budget. |
| `edgeone.json` | Daily cleanup schedule. |

## Main Flow

Browser derives AES-GCM key from password, encrypts chunks, asks EdgeOne for upload URLs, uploads directly to Blob, then marks the manifest ready. Recipient sends only a derived proof; `open` returns one-time direct download URLs and the browser decrypts locally.

## Pay Attention

- Never send plaintext/password through the server; Blob bytes do not pass through Edge Function responses.
- Text/pasted images are capped at 4 MiB; regular files at 800 MiB with 4 MiB plaintext chunks (at most 200). Upload/download URLs last one hour; the daily transfer expiry still applies. Keep the browser and Edge Function size limits synchronized.
- Files above 200 MiB require OPFS writable storage. Check available browser quota and prepare the writer before calling the consume-on-open endpoint, then decrypt/write one chunk at a time. Smaller files retain the in-memory path.
- Releasing a received file revokes its object URL and removes its temporary disk file. Failed/cancelled receives abort and remove the partial file; leaving the UI cancels an active receive. A later large receive clears temporary files older than 24 hours after tab interruptions.
- The free Blob account quota is 1 GB across stored objects, independent of the per-file limit. Consuming a code removes its indexes; server chunks remain until scheduled/manual cleanup, so an 800 MiB transfer leaves little capacity for additional uploads.
- Do not add a silent Next/Netlify fallback; `NEXT_PUBLIC_TRANSFER_API_BASE` is required.
- `complete` must not HEAD every chunk; missing objects surface at recipient download.
- Cleanup is daily 02:00 Asia/Shanghai; stats/manual cleanup require the protected admin-password hash.
- Manual cleanup always validates the admin password, including at 02:00, then deletes one Blob listing page of at most 20 objects with concurrency eight. The browser follows opaque cursors across independent requests and retains cumulative failures/progress. A failed/interrupted run must not be labeled complete; re-running starts at the remaining keys. Leaving the page stops further requests, but an already accepted delete batch may finish on the server.
- The daily schedule calls `/api/transfer-cleanup` in the Node.js Cloud Functions runtime, where one worker can drain deletion pages without the Edge runtime's 64-fetch limit. The worker retains the existing Beijing 02:00–02:59 scheduler access window; it uses the existing Blob deploy credential and store environment setting. `edgeone.json` allows 120 seconds; the worker stops starting new pages after 100 seconds and returns HTTP 503 with partial progress if interrupted or any deletion fails. Do not move its all-pages loop back into an Edge Function.
- Cleanup cursors are lexicographic object markers, not array offsets: deleting the previous page must not skip later keys. Both cleanup modes are restricted to `transfer/`; listings are live, so uploads concurrent with cleanup can also be removed.
- Access to an expired transfer invalidates only its four small indexes/markers and returns 410. Chunk deletion is deferred to manual/scheduled cleanup; never loop over an expired file's up to 200 chunks inside a normal Edge API request.
- Admin statistics use separate HTTP requests with Blob `list({ limit: 20, paginate: false, cursor })` and at most eight concurrent metadata reads. Do not scan all metadata in one Edge Function invocation: its Fetch API permits only 64 outgoing requests, including SDK credential exchange and listing. The UI's 0–200 limit controls displayed largest objects, not scan scope.
- The status client merges counts, known bytes, errors and the global largest objects across pages, shows scan progress and aborts on unmount. Only a finished scan without metadata errors may show a complete total; missing/invalid object sizes and interrupted scans must remain visibly incomplete. Blob listings are live rather than a transaction snapshot, so concurrent uploads/deletes can change results while scanning.
- Preserve manifest, PBKDF2, IV, and consume-on-open semantics.
