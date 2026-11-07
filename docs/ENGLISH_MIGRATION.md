# Noble AI — English-language migration

**Status:** in progress. English is the default language of the product interface, developer documentation, contribution guides, and tests. Story output and user-authored content remain multilingual by design.

## Completed in master

- [x] Rewrite the root `README.md` as an English-language product overview, with user journeys, features, screenshots, installation, architecture, and project links.
- [x] Translate `AGENTS.md`, `CONTRIBUTING.md`, quickstart, setup, checkpoint installation, ComfyUI runtime, TTS, Piper voices, Model Hub, Story Hub, workers, security, and third-party integration guides.
- [x] Translate architecture, API contract, narrative memory, GPU, Colab QA/launch, Creator media, image, and visual sprite technical guides.
- [x] Translate the roadmap, game design document, Isekai Zero reference study, and open-source reuse reference materials.
- [x] Migrate primary React navigation, Library, Reader, Model Hub, Download pages, independent Settings panels, Creator Studio, and runtime configuration copy to English.
- [x] Align most Playwright test labels with the English UI; restore the unchanged backend sentinel `license="sin verificar"` where used as protocol data.
- [x] Configure GitHub Actions concurrency so newer commits cancel superseded checks on the same branch.

## Remaining, not complete

- [ ] **`TODO.md`:** translate the entire detailed implementation checklist while preserving every `[x]`/`[ ]`, stable AUD/N identifiers, references, and verification evidence. Do not collapse hundreds of acceptance tasks into a generic summary.
- [ ] **`docs/ARGON_AUDITORIA.md`:** translate the complete original audit, preserving its section numbering, distinctions between observations and recommendations, links, and limits of evidence.
- [ ] **`docs/PROGRESO.md`:** translate the historical development log without altering commit SHAs, dates, CI measurements, or stated pass/fail outcomes.
- [ ] **`docs/QA_Y_ACEPTACION.md`:** translate test procedures and hardware acceptance criteria without weakening them or claiming mocked GPU results are physical measurements.
- [ ] Audit remaining backend-facing errors, diagnostics, developer comments, example strings, generated documentation, and notebooks for Spanish **product copy**. Preserve stable persisted values, public URLs, API fields, exact test fixtures, and model/provider identifiers unless a separate migration is designed.
- [ ] Finish a visual copy audit of all React screens, including mobile. Remove mixed-language phrases introduced by mechanical substitutions; prefer translating complete sentences.
- [ ] Confirm successful Python + Vite + Playwright runs at the **latest** `master` SHA. Old CI success does not certify later language changes.
- [ ] Add automated regression checks for untranslated English-default UI copy once meaningful exceptions are documented.

## Compatibility boundary

**Translate:** visible headings, buttons, form labels, placeholders, messages, error copy, help text, accessibility labels, docs, and test descriptions.

**Keep stable:** REST paths, JSON keys, SQLite columns, hash routes such as `#/configuracion`, story-pack IDs, model filenames, hash values, license protocol sentinels, migration files, and saved user data. Translating any such identifier requires a separate compatibility migration with data and URL tests.

**Preserve as multilingual content:** stories and author-provided text, fiction examples tied to a specific locale, named worlds, model names, and voice language/accent labels. English UI must not force all narrated stories into English or erase the `es-419` output option.

## Completion gate

Migration is complete only when no untranslated product copy remains, the four large historical docs above have faithful English equivalents in place, compatibility data remain intact, and current `master` has passing build and automated tests. Record the final checked SHA and CI run instead of assuming work is complete from earlier runs.
