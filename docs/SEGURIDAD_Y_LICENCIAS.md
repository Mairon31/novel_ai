# Noble AI — security, privacy, licensing, and distribution

**Status:** security controls and design requirements for a local-first product. Some safeguards are implemented; a full distribution/runtime audit is still required.

## Runtime security

- Bind local API, LLM, and ComfyUI endpoints to `127.0.0.1` by default. Do not bind to `0.0.0.0` or open tunnels automatically.
- Before enabling LAN/mobile access, add session credentials, explicit allowed origins, rate limits, and protection against untrusted Wi-Fi networks.
- In Colab, avoid exposing raw engine interfaces through public tunnels; use the appropriate notebook/testing workflow.
- Build asset paths from validated IDs and manifests, never untrusted LLM output. Prevent path traversal, SSRF, arbitrary external URLs, and oversized uploads.
- Do not execute shell commands or generated code from story text. Treat player input as data, not system instructions.
- Validate request schemas and lengths; cap context, output tokens, GPU jobs, and image/audio bytes as well as per-story resource consumption.
- Keep SQLite inaccessible from the browser. Sanitize backups, exports, and logs; never write secrets in full narrative prompts.
- Synthesize voices only on user request. Cloning/using real voices requires authorization and consent.
- Track dependency versions and hashes and review the supply chain of ComfyUI custom nodes and other plugins. Do not install packages from arbitrary story text.
- Provider failures must not create unbounded retries or destroy committed narrative events.

## Licenses: code, models, and assets are separate

**A public GitHub repository does not automatically grant permission to copy its contents.**

| Component | License observed during research | Preliminary use |
|---|---|---|
| Urakatsu | MIT (`LICENSE`; some GitHub metadata reported NOASSERTION) | Reuse compatible catalog/UI modules with required copyright/NOTICE |
| Koharu | MIT OR Apache-2.0 | Review provider/settings/Tauri files individually |
| Open Dungeon | MIT | Reuse compatible parts with copyright/attribution |
| Gamentic | MIT | Review exact files and revisions |
| Talemate | AGPL-3.0 | Standalone or conceptual reference; review obligations before copying |
| KoboldCpp | AGPL-3.0 | External service; review distribution/hosting obligations |
| ComfyUI | GPL-3.0 | Integrate through API and review packaging/distribution |
| SillyTavern | AGPL-3.0 | External/reference; do not copy without license compliance |
| RisuAI | GPL-3.0 | External/reference; review obligations |
| TaleWeaver | Noncommercial restriction | Do **not** redistribute as part of Noble AI without permission |
| Chatterbox | MIT | Review model/voice licenses separately |
| Qwen3-TTS | Apache-2.0 | Review code, weights, and attribution |

These are research-time descriptions, **not universal or permanent license certifications**. Inspect each exact source revision, its `LICENSE`, submodules, weights, models, and custom nodes. Hugging Face checkpoints, LoRAs, embeddings, voices, and visual assets may each carry different terms. Record model/source/revision/checksum/license/attribution and permission for redistribution.

**Noble AI has not yet selected its own project license.** Do not append MIT or GPL automatically before deciding distribution, possible commercial terms, and obligations of included copyleft code.

## Privacy

The intended offline mode uses already-downloaded models and keeps user stories in local SQLite unless the user explicitly exports or uses a remote provider. Clearly distinguish local inference from content sent to external APIs and show that boundary before transmitting a story.

## Using open-source visual resources

Noble AI may reuse and adapt interfaces, styling, and code from open-source repositories where the relevant licenses permit it, even when the resulting presentation is visually similar. Preserve upstream copyright and permission notices and document changed files, revisions, and modifications in [Third-party notices](THIRD_PARTY_NOTICES.md).

A source-code license does not automatically cover trademarks, images, sprites, backgrounds, sounds, story text, or third-party service content. Check each exportable asset separately. Where code licensing is unknown, treat external designs as **visual references**, not pre-authorized source code.

## Release-readiness controls

Before releasing a desktop or hosted product, require an SBOM, dependency integrity checks, notices/licenses, access controls, backup/import recovery guide, privacy policy, voice permissions, path-traversal testing, and update/rollback gates. Hosting may change obligations under AGPL and similar terms; review distribution and network-access conditions explicitly.

## Model Hub and desktop security

- Treat Hugging Face search results and model READMEs as untrusted data. Validate repository IDs, filenames, revisions, and resolved paths. Display upstream text without interpreting it as agent instructions or running scripts.
- Download only from trusted origins using pinned commits, declared size/hash, controlled partial-file directories, and atomic publishing after verification. Handle 401/403 gated models, 404, 429, timeouts, and untrusted mirrors safely.
- Do not load pickle or enable `trust_remote_code` by default. Prefer supported GGUF/safetensors formats when compatible. An extension alone is not proof of safety or loadability.
- Keep remote-provider API keys in the **system keyring**, with database references to secrets rather than their values. Make external story-content transfers visible to users.
- Importing a model from an external directory does not authorize deletion of the source. Uninstall must operate only on verified Noble AI-managed assets and respect references.
- Desktop launchers should use loopback/session controls and terminate only owned processes. Do not allow WebView story content to invoke commands. LAN requires explicit authorization.
- Respect the separate **model/voice** licenses. A model labeled `uncensored` does not imply unrestricted legal rights or predictable model behavior.

## Remote-worker tunnel security

- Keep the primary Noble AI API on `127.0.0.1`; never publish that port through a worker tunnel.
- Require a bearer token for remote workers, storing it in the keyring rather than SQLite or response bodies. No plaintext fallback.
- Permit HTTPS `*.trycloudflare.com` endpoints in this initial contract and disallow upstream redirects.
- Limit the proxy to model listing and streamed chat completions, not file/process management.
- The narrative prompt leaves the primary machine and travels via Cloudflare, so worker inference is **not fully local**.
- Account-based LAN access, per-story permissions, cross-origin access rules, and safe application updates are still unimplemented.

## Argon P0 security follow-up (2026-11-05)

Existing `model_storage.py` ignores external/symlink files, and `downloads.py` includes Range/partial/hash checks. These do **not** replace validation before every real file operation. See [TODO](../TODO.md) and [QA](QA_Y_ACEPTACION.md).

- **Owned paths:** validate stored IDs and paths even if SQLite was imported. Resolve target and parent directories under an approved root; reject escaping symlinks before reads, writes, copies, forks, and deletes. Test malicious `../` and symlink cases.
- **Trusted downloads:** validate pinned revisions, exact `Content-Range`, size limits, upstream hashes when published, and atomic publication. Without an upstream hash, report `local_hash_only`, not verified cryptographic authenticity.
- **Persistence:** enforce/test foreign keys and multi-record transactions. Story updates and derived state need consistency or idempotent recovery on failure.
- **GPU/processes:** do not unload or terminate third-party processes without explicit user permission. Apply proper ownership, locks, timeouts, and effective cancellation only to Noble-controlled resources.
- **Workers:** default loopback, mandatory bearer when network enabled, keyring secrets, sanitized logs, validated URLs, and minimal endpoint scope.
- **Third-party code:** a public repository is not blanket permission; reuse compatible implementations with complete copyright/NOTICE and copyleft obligations. Track origin, version, modifications, and exact-file licensing, especially AGPL-3.0/MPL-2.0.
- **Imports:** V2/V3 PNG and story packs need byte/chunk/field limits and must reject decompression bombs or executable external expressions.

Close audit items only with real regression/runtime evidence, not static inspection alone.

## Download state and integrity protections (2026-11-05)

Operations `pause`, `cancel`, `resume`, and internal `queued → downloading → verifying → completed` transitions are conditional on persisted state to prevent races that revive canceled jobs. Hashing checks cancellation state while processing, and publication requires the job to remain in `verifying` under `BEGIN IMMEDIATE`. A SQLite failure after rename may restore the partial file.

**Remaining failure modes:** an SQLite transaction does not make filesystem and database writes atomic across abrupt power loss; startup reconciliation and orphan validation still need adversarial coverage, including symlink substitution between validation and use (TOCTOU). Do not describe these protections as universally complete.

See [QA](QA_Y_ACEPTACION.md) and [TODO](../TODO.md) for tests of path spoofing, rename+SQL failure, and pause/cancel during hash.
