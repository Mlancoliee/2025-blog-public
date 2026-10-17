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
| `edge-functions/api/transfer/` | Create, complete, meta, open, stats, cleanup API. |
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
- Preserve manifest, PBKDF2, IV, and consume-on-open semantics.
