# Noble AI — Batched CI and Session Recovery

**Last updated:** 2026-11-08  
**Repository / integration branch:** `Mairon31/novel_ai` / `master`  
**Purpose:** Avoid spending GitHub Actions minutes on every commit, and provide a durable handoff if an AI development session is interrupted.

## Policy: one full verification per five implementations

- **Five completed functional implementation units = one full CI batch.** A unit is an independently reviewable feature, bug fix, or integration with its associated test changes. A unit can take multiple commits; documentation-only commits and corrections to the same unit do **not** increment the counter.
- Record each completed unit immediately in the ledger below. `NOT RUN` means the test was added but has not yet executed; do not claim `PASS` based only on file changes or the absence of reports.
- At **5/5**, or sooner for serious P0 security/data-integrity changes, a production-blocking regression, or an explicit request, intentionally trigger the workflow. Never automatically run it after an ordinary commit.
- Continue writing **targeted tests with each implementation**, and run inexpensive checks locally if an environment is available. Do not leave all testing design until the end of a batch. Full browser execution is deferred to the batch boundary, not test authoring.
- If a full batch fails, preserve the failed run URL and keep the batch open. Fix the relevant issues, validate locally or run a `quick` batch if needed, then run the final corrected SHA once. Avoid repeating the full browser suite after every small fix.

**Important limitation:** GitHub Actions cannot intrinsically detect what counts as "one implementation". The count here is maintained explicitly by the developer/assistant, not by push events. This prevents tiny commits from consuming CI minutes.

## GitHub Actions triggers and scopes

Workflow: [Noble AI · batched verification](../.github/workflows/p0-docs.yml).

**Ordinary `master` pushes and PR updates no longer start this workflow.** It uses `workflow_dispatch` (manual), an explicitly pushed `qa-batch-*` tag, or a `master` push changing ONLY the dedicated CI request path `.github/ci-batches/full-request.txt`. The third option is intended for connected GitHub tooling that can commit but cannot invoke `workflow_dispatch`.

### Manual: default way to close a batch

1. Visit [Actions](https://github.com/Mairon31/novel_ai/actions), open **Noble AI · batched verification**, and select **Run workflow**.
2. Choose **branch `master`**, **scope `full`**, and enter the current batch ID (such as `B001`). Keep `live_catalog_probe` disabled unless deliberately testing the live Hugging Face catalog.
3. When **both** `python` and `frontend` finish, record their final conclusions, the tested SHA, Python/Playwright counts, any failed tests, and the run URL here and in `docs/PROGRESO.md`. The browser artifacts are retained for 7 days.
4. Only a successful full run closes the batch; start the next five-slot batch at 0/5. Do not interpret a simulated GPU test as hardware evidence.

Scopes:

| Scope | Runs | Intended use |
| --- | --- | --- |
| `quick` | All offline Python unit tests and TypeScript/Vite frontend build | Risky intermediate change, diagnosing a failing batch |
| `full` | Everything in `quick`, plus Chromium Playwright **once** across desktop and mobile | Five-unit batch completion or urgent full QA |
| Optional live probe | Public Hugging Face API probe, nonblocking | Only when deliberately requested |

A passing `quick` workflow does not validate browser interactions. The old preliminary selected Playwright pass was removed because the full suite already covers those tests.

### Connector-friendly explicit trigger (no manual workflow dispatcher required)

When a batch reaches 5/5 and the GitHub connection cannot start a workflow
directly, make **one final commit modifying only**
`.github/ci-batches/full-request.txt` with an updated batch ID, the last
implementation SHA, and a clear reason. GitHub's path-filtered `push` runs
the full workflow **once** against the *trigger commit SHA*. The sentinel
path MUST NOT be edited for normal development. A later docs update will
not start another run.

This keeps the entire repo on `master`; it is not a new branch. Never
combine this request with the manual or tag trigger for the same batch.

### Alternative explicit trigger: one QA tag

Do not use this method *and* manual dispatch for the same batch (it would create duplicate runs).

```bash
git switch master
git pull --ff-only origin master
git tag qa-batch-b001
git push origin qa-batch-b001
```

Pushing a `qa-batch-*` tag requests a full workflow on that precise commit. Tags are checkpoints, **not new development branches**. No nightly or periodic CI has been enabled.

### Between batch runs: targeted checks

When a terminal and dependencies are available, run only the relevant checks, e.g.:

```bash
python -m unittest discover -s tests -p 'test_visual_preflight.py' -v
npm --prefix apps/web run build
```

If the session has only GitHub repository access and cannot run code, still write/review focused tests and record `NOT RUN`. Do not use an expensive full CI run merely to confirm a documentation edit.

## Last fully validated baseline

| Item | Value |
| --- | --- |
| Last fully verified repository SHA | `21a9ae40a114027dfe5e96c960f08bfddaf174e7` (5-unit B001 plus fixes, explicit full-batch trigger) |
| Successful full CI run | [#42465459245](https://github.com/Mairon31/novel_ai/actions/runs/42465459245) |
| Evidence at that exact SHA | **436/436 Python**, **110/110 Playwright** desktop/mobile, frontend build PASS |
| Most recent milestone | B001 5/5: initial visual plans, agency contract, reviewed gallery cover, story freedom modes, NPC goals/refusals |
| Previous documentation checkpoint | `e87bd89a6a8c8f81f562e7a1124607a2bdd20dfc` |
| CI trigger policy commit | `1d65511eb55ef0ce003c047d32f79c8b465a476a` |
| Policy/docs verification | **NOT RUN** by design; changes only to workflow/docs, no functional code modified |

The new successful full-batch baseline verifies code through `21a9ae40`. Earlier baseline: `e87bd89a`, [CI #42461993185](https://github.com/Mairon31/novel_ai/actions/runs/42461993185) (419 Python + 102 Playwright PASS). It does **not** certify any future code committed after the new baseline. Always inspect the current `master` SHA and the open batch before asserting tests passed.

## Batch B001 — CLOSED (5/5; FULL CI PASS)

Count **functional implementations**, not Git commits. Enter the TODO ID, relevant commit(s), tests written, and executed result into the first unused slot. A documentation-only handoff does not count.

| Unit | TODO / scope | Commit(s) | Tests written / executed | State |
| --- | --- | --- | --- | --- |
| 1 | N-22 — deterministic initial visual asset plan, author-facing media checklist, editable prompt and explicit ComfyUI background generation | `f614631`, `f56b4da` | [CI #42465459245](https://github.com/Mairon31/novel_ai/actions/runs/42465459245): Python/browser suites completed successfully (overall 436/436 + 110/110 PASS); real GPU/model behavior not tested. | VERIFIED IN B001 |
| 2 | N-18 — deterministic narrator agency and causal consequence policy for four interaction modes and consecutive continuation pacing | `fcf7164`, `1f8516d` | [CI #42465459245](https://github.com/Mairon31/novel_ai/actions/runs/42465459245): Python/browser suites completed successfully (overall 436/436 + 110/110 PASS); real GPU/model behavior not tested. | VERIFIED IN B001 |
| 3 | N-22 — explicitly reviewed gallery-to-cover promotion (SHA-verified story-owned source, durable idempotent mapping, original preserved) | `a85d3dd`, `b77ace5`, `8d8b1cf` | [CI #42465459245](https://github.com/Mairon31/novel_ai/actions/runs/42465459245): Python/browser suites completed successfully (overall 436/436 + 110/110 PASS); real GPU/model behavior not tested. | VERIFIED IN B001 |
| 4 | N-18 — guided/flexible/strict story freedom modes persisted in Creator Blueprint, with legacy defaults and narrative policy integration | `5f03d3b`, `bee5cbf` | [CI #42465459245](https://github.com/Mairon31/novel_ai/actions/runs/42465459245): Python/browser suites completed successfully (overall 436/436 + 110/110 PASS); real GPU/model behavior not tested. | VERIFIED IN B001 |
| 5 | N-18 — author-defined NPC independent goals and refusal conditions stored per character, with legacy-update preservation and private narrator context | `de9a704`, `673e473` | [CI #42465459245](https://github.com/Mairon31/novel_ai/actions/runs/42465459245): Python/browser suites completed successfully (overall 436/436 + 110/110 PASS); real GPU/model behavior not tested. | VERIFIED IN B001 |

**Batch boundary implementation commit:** `673e47363a1f3f7ee89edaa53ebd0b83334ae526`.  
**Full batch workflow attempt 1:** [Run #42464879028](https://github.com/Mairon31/novel_ai/actions/runs/42464879028) on `b03be27d698ea632ecc90740e45dcb64416fc5dc` **FAILED**: Python 435/436 passed (context inspector expected the premise in the first prompt paragraph); browser 108 passed/2 failed (truncated PNG in new gallery-cover E2E on desktop and mobile). Fixes: `59d590e` (section parsing), `e6281f1` + `4981c67` (Pillow-verified PNG). Failure evidence retained; superseded by passing attempt 2.  
**Full batch workflow attempt 2:** [Run #42465459245](https://github.com/Mairon31/novel_ai/actions/runs/42465459245) on `21a9ae40a114027dfe5e96c960f08bfddaf174e7`: **436/436 Python + 110/110 Playwright PASS** (desktop/mobile), Vite build PASS. B001 closed. Neither CI nor mocked inference certifies real ComfyUI GPU rendering or semantic NPC behavior.  
**Outstanding failures:** none in the completed second CI run. Deferred GPU, scene director, queue recovery, and broader i18n work remain tracked in `TODO.md`. Locale catalogs were structurally checked: 1,694 keys each, 0 interpolation differences.

Possible next priorities: N-22 persistent image generation queue and reviewed cover generation, N-18 scene-beat planning and model-based semantic evaluation, and N-07 Creator Studio work. The deferred i18n audit remains in `TODO.md` as I18N-01 through I18N-07; do not restart a full translation round without instructions.

## Batch B002 — READY FOR FULL CI (5/5)

The five verified B001 implementations above are **not** part of this new batch. Record only independently completed new functional units below; do not trigger CI until five units or a critical P0 exception.

| Unit | TODO / scope | Commit(s) | Tests written / executed | State |
| --- | --- | --- | --- | --- |
| 1 | N-22 — SQLite-backed opt-in ComfyUI image jobs, idempotent request UUID, persistent seed, restart recovery, cancel/retry, and Creator Studio job polling | `a4fd0d1`, `a565571`, `53f9e69`, `c38bd5d`, `f4339f2`, `a61f952`, `1cbcf9d`, `3153cc9`, `df31191` | New `tests/test_image_jobs.py` and `apps/web/tests/image-job-recovery.spec.ts`, updated `visual-preparation.spec.ts`; all **NOT RUN** until B002. Four-language catalog parity checked structurally (1,719 keys each after unit 2); active queue capped at 8 jobs, with admission test. | IMPLEMENTED / UNVERIFIED |
| 2 | N-18 — editorial arc milestones (planned/active/resolved) in Creator Blueprint, private narrator prompt and creator UI; clone and legacy editing compatibility | `2018265`, `e365955`, `cb0cec1` | Added `tests/test_creator_arc_beats.py` + `apps/web/tests/creator-arc-beats.spec.ts`; **NOT RUN** until B002 full CI. | IMPLEMENTED / UNVERIFIED |
| 3 | N-19 — six semantic reader composer modes: speak, act, think, observe, interact, narrate, with actual distinct narrator directives, input hints, history labels and responsive keyboard/mobile controls | `efa2870`, `47c6c24`, `90a0f0a`, `88d1926` | `tests/test_reader_interaction_modes.py`, `apps/web/tests/reader-interaction-modes.spec.ts` added; **NOT RUN**. E2E/semantic model verification deferred to B002 full CI. | IMPLEMENTED / UNVERIFIED |
| 4 | N-19 — browser-local per-story reader compose draft and selected interaction mode, 14-day expiry, validation, corruption recovery, and cleanup after a completed turn | `c9bc7b9`, `08b9582` | Added `apps/web/tests/reader-draft-recovery.spec.ts` (two browser cases), **NOT RUN** until B002 full CI. No user text sent to a new server endpoint. | IMPLEMENTED / UNVERIFIED |
| 5 | N-19 — story-specific narrative freedom reader settings with an atomic PATCH that preserves Creator Blueprint text, beats, and global preferences | `eee6e33`, `8c6b32b`, `75d4d1c`, `f46c536`, `91e4cb1` | Added `tests/test_reader_story_settings.py` and `apps/web/tests/reader-story-settings.spec.ts`; **NOT RUN** until B002 verification. | IMPLEMENTED / UNVERIFIED |

**B002 full CI attempt 1:** [Run #42469429842](https://github.com/Mairon31/novel_ai/actions/runs/42469429842), trigger SHA `6893b57febc68133f0fadf3705a469cfd0ae104d`: Python 451 tests, **2 FAIL + 6 ERROR** (new narrator-mode line mapping and i18n dynamic key). Repairs in `94f3284`, `2f726e0`, `bb2f1c2`, including context inspector support for the new modes. **Browser completed with 120/122 PASS; 2 failures** in the same new `reader-draft-recovery.spec.ts` assertion on desktop/mobile (Playwright's partial "Act" label matched "Interact" as well). Fixed with `d036d94` using `exact: true`. B002 remains OPEN/UNVERIFIED; one consolidated full retry is required on corrected code.  
**B002 implementation boundary:** `91e4cb1de8b0fecddee1f0ff887966c4b9abc929` (all five functional units before documentation/trigger).  
**Local verification limitation:** a network test from the working container could not resolve `github.com`, so a full local clone/build was unavailable. No GitHub Actions run was started by interim commits.

## Resume procedure after an interrupted session

1. Inspect `origin/master`, `AGENTS.md`, this file, `TODO.md`, and the end of `docs/PROGRESO.md`. Do not assume a previous assistant statement was pushed; verify exact commits and GitHub Actions conclusions.
2. Compare current HEAD with the **fully verified SHA** above. Reconcile the open ledger against actual commits: completed implementations, unrun tests, open errors, and remaining tasks.
3. Continue working **directly on `master`**, without making extra branches. For each completed unit, update the corresponding slot and report any targeted test as PASS/FAIL/NOT RUN. If the ledger is at 5/5 and no run exists yet, submit the dedicated CI request-file commit rather than starting new implementations.
4. On reaching five completed units, run **one** full GitHub Actions job at the batch boundary (or advance QA for a critical P0 exception). Wait for the actual conclusion before checking off any CI-dependent milestone.
5. If the run fails, preserve logs, fix failures without launching multiple full runs, and revalidate the final corrected SHA. If successful, record evidence and begin B002 at 0/5.
6. Keep product rules intact: local-first, API diagnostics in English, authored story text untouched, i18n global audit deferred, and no fabricated GPU/CI evidence.

**Session handoff format:**

`HEAD <full SHA> | batch <ID> <completed>/5 | last full CI <URL + tested SHA> | validation PASS/FAIL/NOT RUN | next implementation <TODO ID>`

This line should appear in every development-session conclusion and be written to this file or `docs/PROGRESO.md` when the state changes.
