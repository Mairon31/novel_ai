# Contributing to Noble AI

Thanks for your interest in Noble AI. Contributions can improve the web interface, narrative engine, images, speech, accessibility, compatibility, documentation, and automated testing.

## Before you begin

1. Search [existing issues](https://github.com/Mairon31/novel_ai/issues) to avoid duplicate work.
2. For substantial changes, open a proposal explaining the motivation, scope, and verifiable acceptance criteria.
3. Keep pull requests focused. The project's active integration branch is `master`; use a feature branch for community submissions unless maintainers instruct otherwise.
4. Do not commit large model checkpoints, credentials, private keys, personal stories, or screenshots containing sensitive information.
5. Write **public-facing content, documentation, UI copy, and contributions in English**. User-authored story content and the story output language may remain multilingual.

## Set up and test

Follow the [quickstart](docs/QUICKSTART.md), then run:

```bash
python -m unittest discover -s tests -p 'test_*.py' -v
npm --prefix apps/web run build
npm --prefix apps/web run test:e2e
```

Playwright requires its browser dependencies and the development services described in [the CI workflow](.github/workflows/p0-docs.yml). GitHub Actions no longer runs on every commit or PR update; refer to [Batched CI and Session Recovery](docs/CI_BATCHES_AND_SESSION_RECOVERY.md). A maintainer triggers `full` after five completed implementations, or `quick` for an earlier Python/build check. If you cannot run a check, report it as **NOT RUN** instead of claiming it passed.

## Pull request checklist

- Explain the problem and the intended behavior change.
- Provide tests for relevant success and failure paths, and disclose existing failures.
- Include desktop and mobile screenshots for UI changes where practical.
- Document model/provider prerequisites, security boundaries, and limitations without leaking secrets.
- Update API contracts, README, roadmap, TODO, or technical documentation where behavior changes.
- Preserve licenses, copyright notices, and upstream references for reused code or assets.
- Do not present simulated GPU measurements as physical benchmarks.

The README presents the product to new users; internal milestones, decisions, and evidence belong in `docs/` and GitHub issues.

## Reporting bugs

Open an [issue](https://github.com/Mairon31/novel_ai/issues) with reproduction steps, expected and actual results, operating system, and version or commit. Remove private paths, API keys, tokens, and personal data from logs before sharing.

Thank you for helping improve Noble AI.
