# Contributing to dsh-better-approve

Contributions are welcome from people and from agents alike: issues and pull
requests opened by either are reviewed the same way.

## What to send where

- **Open a pull request directly** for documentation, tests, small bug fixes and
  polish. Small, focused changes are the easiest to accept.
- **Open an issue first** for a new feature, a behavior change, a new
  dependency. Those are contracts other integrations rely
  on, so the design is agreed before code is written.

## How this repository is shaped

- **Host and client are two halves.** `lib/index.js`, `lib/review.js` and
  `lib/settings.js` run in the Host; `lib/client.js` runs in the browser and may
  use only `react`/`react-dom` plus injected services. `cordis.patch.yml`
  disables the shipped `auto-review` row and inserts this bundle.
- **No build step, no dependencies.** `npm test` runs the committed ES modules
  directly. Do not add a runtime dependency, a lockfile, or an `@deepseek-ai/*`
  import.
- **One integration owns `auto`.** The plugin registers the reserved preset and
  the patch disables the shipped row; never register the preset twice or
  re-enable the shipped row.
- **Review requests never send `temperature`.** Reasoning-first APIs reject it
  with HTTP 400; `test/review.test.mjs` guards both the options builder and the
  captured stream options.
- **No risk relaxation.** The fixed policy and the low/medium/high
  classification stay as shipped; a denial under `onDenied: deny` is final, and
  an ask under `never` is finalized as a denial.
- **Fail closed while closing.** A call that still resolves to `auto` during
  disposal is cancelled and in-flight reviews drain; live `auto` Sessions are
  migrated to `danger-full-access`, the same migration the shipped integration
  performs.
- **Everything is bilingual.** `README.md` and `README.zh.md` describe the same
  thing, and `enDict`/`zhDict` in `lib/client.js` must carry the same key set.
  `locale/*.json` holds only the plugin metadata.
- **Metadata is machine-checked.** `test/manifest.test.mjs` guards the manifest,
  the shipped file set and relative documentation links.
- **Sources stay clean.** UTF-8 without BOM, LF, two-space indent, no tabs; no
  semicolons, single quotes, and trailing commas in multiline literals — match
  the file you are editing.

## Before you open the pull request

- Node `^22.19.0 || >=24.0.0`; no `npm install` is needed.
- `npm test` and `npm run pack:check` pass.
- New behavior has a test that fails without the change; UI and RPC changes also
  extend `test/client-smoke.mjs`.
- If you touched the gate or the client, verify against a real installation:
  `dsh plugin --profile dba-dev add /path/to/dsh-better-approve`, then exercise
  the changed path and say what you ran.
- Update the docs in the same change.

## License

By contributing you agree that your contribution is licensed under the MIT
license in [LICENSE](LICENSE), and that the attribution in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) stays accurate.
