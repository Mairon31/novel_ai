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

**Ordinary `master` pushes and PR updates no longer start this workflow.** It uses only `workflow_dispatch` (manual) and an optional explicitly pushed `qa-batch-*` tag.

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
| Last fully verified repository SHA | `e87bd89a6a8c8f81f562e7a1124607a2bdd20dfc` (N-22 code was last changed in `91e9362`) |
| Successful full CI run | [#42461993185](https://github.com/Mairon31/novel_ai/actions/runs/42461993185) |
| Evidence at that exact SHA | **419/419 Python**, **102/102 Playwright** desktop/mobile, Vite build PASS |
| Most recent milestone | N-22 opt-in visual first-turn readiness gate + explicit reversible text-only choice |
| Previous documentation checkpoint | `e87bd89a6a8c8f81f562e7a1124607a2bdd20dfc` |
| CI trigger policy commit | `1d65511eb55ef0ce003c047d32f79c8b465a476a` |
| Policy/docs verification | **NOT RUN** by design; changes only to workflow/docs, no functional code modified |

The passing baseline verifies code through `e87bd89a` under the previous per-commit workflow. It does **not** certify any future code committed after it. Always inspect the current `master` SHA and the open batch before asserting tests passed.

## Batch B001 — OPEN (3/5)

Count **functional implementations**, not Git commits. Enter the TODO ID, relevant commit(s), tests written, and executed result into the first unused slot. A documentation-only handoff does not count.

| Unit | TODO / scope | Commit(s) | Tests written / executed | State |
| --- | --- | --- | --- | --- |
| 1 | N-22 — deterministic initial visual asset plan, author-facing media checklist, editable prompt and explicit ComfyUI background generation | `f614631`, `f56b4da` | `tests/test_visual_preflight.py` (API, no hidden plot, gallery selection), `apps/web/tests/visual-preparation.spec.ts` (desktop/mobile, no implicit render). **NOT RUN**: deferred to B001 full batch. | IMPLEMENTED / UNVERIFIED |
| 2 | N-18 — deterministic narrator agency and causal consequence policy for four interaction modes and consecutive continuation pacing | `fcf7164`, `1f8516d` | `tests/test_narrative_agency.py` (prompt construction, author-guidelines preservation, mode-specific rules). **NOT RUN**: deferred to B001 batch; no semantic LLM inference benchmark. | IMPLEMENTED / UNVERIFIED |
| 3 | N-22 — explicitly reviewed gallery-to-cover promotion (SHA-verified story-owned source, durable idempotent mapping, original preserved) | `a85d3dd`, `b77ace5`, `8d8b1cf` | `tests/test_gallery_cover_approval.py` and `apps/web/tests/gallery-cover-approval.spec.ts` created; **NOT RUN**, scheduled for B001 final CI. | IMPLEMENTED / UNVERIFIED |
| 4 | — | — | NOT RUN | OPEN |
| 5 | — | — | NOT RUN | OPEN |

**Batch boundary commit:** not yet chosen.  
**Full batch workflow:** NOT RUN.  
**Outstanding failures:** none known at the baseline. The first two implementations are committed, but their newly added tests have **NOT RUN**, so runtime regressions remain possible. Four-language catalogs were parsed and compared for keys/interpolations without launching GitHub Actions. Re-evaluate at B001 full batch.

Possible next priorities: N-22 persistent image generation queue and reviewed cover generation, N-18 scene-beat planning and model-based semantic evaluation, and N-07 Creator Studio work. The deferred i18n audit remains in `TODO.md` as I18N-01 through I18N-07; do not restart a full translation round without instructions.

## Resume procedure after an interrupted session

1. Inspect `origin/master`, `AGENTS.md`, this file, `TODO.md`, and the end of `docs/PROGRESO.md`. Do not assume a previous assistant statement was pushed; verify exact commits and GitHub Actions conclusions.
2. Compare current HEAD with the **fully verified SHA** above. Reconcile the open ledger against actual commits: completed implementations, unrun tests, open errors, and remaining tasks.
3. Continue working **directly on `master`**, without making extra branches. For each completed unit, update the corresponding slot and report any targeted test as PASS/FAIL/NOT RUN.
4. On reaching five completed units, run **one** full GitHub Actions job at the batch boundary (or advance QA for a critical P0 exception). Wait for the actual conclusion before checking off any CI-dependent milestone.
5. If the run fails, preserve logs, fix failures without launching multiple full runs, and revalidate the final corrected SHA. If successful, record evidence and begin B002 at 0/5.
6. Keep product rules intact: local-first, API diagnostics in English, authored story text untouched, i18n global audit deferred, and no fabricated GPU/CI evidence.

**Session handoff format:**

`HEAD <full SHA> | batch <ID> <completed>/5 | last full CI <URL + tested SHA> | validation PASS/FAIL/NOT RUN | next implementation <TODO ID>`

This line should appear in every development-session conclusion and be written to this file or `docs/PROGRESO.md` when the state changes.
