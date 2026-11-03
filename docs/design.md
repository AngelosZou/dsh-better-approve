# Design — dsh-better-approve

## Why replace the native integration

The shipped `@deepseek-ai/dsh-experimental-auto-review` package owns the reserved
`auto` permission preset through `ctx.permissionPresets.registerAuto()`. Only one
integration may register that preset, and its reviewer route is hard-wired to the
Session's request-header provider/model while its request always sends
`temperature: 0`. Changing either behavior requires owning the review gate, so
this bundle:

1. disables the shipped `auto-review` row with an id-targeted patch entry;
2. registers its own `auto` preset and pre-execute listener;
3. keeps the native permission picker unchanged.

Uninstalling the bundle removes the disable patch, so the shipped integration
returns on the next profile composition.

## Files

The fixed review policy and the Session-history reconstruction are derived from
the shipped `@deepseek-ai/dsh-experimental-auto-review` package (MIT); the
configurable route, request fix, policy split, storage, and UI are new here.

| Path | Role |
| --- | --- |
| `lib/review.js` | Safety protocol, Session-history reconstruction, reviewer request, decision helpers |
| `lib/settings.js` | Durable per-Session config and presets |
| `lib/index.js` | Plugin wiring, `auto` preset registration, pre-execute gate, Remote API |
| `lib/client.js` | Composer control and native-style settings dialog |
| `cordis.patch.yml` | Disables `auto-review`, inserts `better-approve` |

## Review flow

For each native or PTC inner tool call:

1. Skip the outer `run_code` transport and calls without an Agent.
2. Resolve the Session's permission preset; only `auto` continues.
3. Read the Session's stored config (defaults: follow the Session model, ask the
   user on denial).
4. Reconstruct the same five review sections as the native gate: fixed policy,
   cwd, project constraints, sourced history, and the pending action.
5. Resolve the reviewer route:
   - explicit `reviewer.provider` / `reviewer.model` when configured;
   - otherwise the request header's provider/model.
   `reviewer.reasoningEffort` is sent only when explicitly set.
6. Stream one review request through `ctx.llm.stream`. The request contains
   **no `temperature` field**. This is the GPT-5 / o-series fix.
7. Parse the closed risk/decision JSON object.

### Decision handling

| Reviewer outcome | `onDenied: ask` | `onDenied: deny` |
| --- | --- | --- |
| allow | delegate to `next()` | delegate to `next()` |
| deny | delegate to `next()`; if it allows, return `ask` | final `deny` with the review result |
| technical failure | delegate to `next()`; if it allows, return `ask` with the error | final `deny` with the error |

Under the `never` approval policy a user confirmation is impossible, so both a
reviewer denial and a reviewer failure are finalized. This mirrors the native
gate's child-Session behavior.

A final reviewer denial uses the shipped error identity (`AutoReviewDeniedError` /
`AUTO_REVIEW_DENIED`) so the existing tool card renders it natively. A reviewer
failure finalized as a denial is returned as its own error without that
identity. The model-facing reason includes the risk class and, when present, the
reviewer's reason. The structured `info.reason` carries the reviewer reason for
the UI.

## Settings model

```jsonc
{
  "version": 1,
  "sessions": {
    "<sessionId>": {
      "config": {
        "reviewer": { "provider": null, "model": null, "reasoningEffort": null },
        "onDenied": "ask" // or "deny"
      },
      "presetId": null,
      "updatedAt": 1793000000000
    }
  },
  "presets": [
    {
      "id": "p-…",
      "builtIn": false,
      "name": "Fast review",
      "description": "",
      "config": { "reviewer": { "provider": "openai", "model": "gpt-5.2", "reasoningEffort": "medium" }, "onDenied": "deny" },
      "createdAt": 1793000000000,
      "updatedAt": 1793000000000
    }
  ]
}
```

- A missing Session record means the shipped default.
- Applying a preset copies its configuration into the Session record; later
  preset edits do not retroactively change that Session.
- Editing a Session keeps `presetId`; the Client marks the configuration as
  modified from the preset (`presetDirty`), and saving the Session does not write
  the preset back. Deleting a preset detaches the Sessions that referenced it.
- Records are capped (500 Sessions, 100 custom presets) and written atomically
  with a temporary file plus rename.
- Reads return detached clones. A document that is not valid JSON falls back to
  the empty one and is moved aside as `settings.json.corrupt-<timestamp>`.
- Built-in presets are computed, never stored, and cannot be edited or deleted.

## Remote API

Hand-written `src-json` Typert descriptors expose one service, `betterApprove`:

| Endpoint | Parameters | Result |
| --- | --- | --- |
| `betterApprove/status` | `sessionId` | preset, active flag, config, preset id, approval policy, Session route, presets |
| `betterApprove/providers` | — | registered providers |
| `betterApprove/models` | `provider` | provider models |
| `betterApprove/efforts` | `provider`, `model` | reasoning efforts and default |
| `betterApprove/save` | `sessionId`, `config`, `presetId` | refreshed status |
| `betterApprove/savePreset` | `preset` | saved preset and preset list |
| `betterApprove/deletePreset` | `presetId` | refreshed preset list |
| `betterApprove/applyPreset` | `sessionId`, `presetId` | refreshed status |
| `betterApprove/reset` | `sessionId` | refreshed status |

`save` and `savePreset` validate an explicit reviewer route with
`ctx.llm.resolveModelInfo`, including the requested reasoning effort. A stale or
unsupported route is rejected with a readable error instead of failing during a
review.

## Client UI

- `conversation.input.left` — compact control, rendered only while the Session's
  `permissions` projection reports `auto`.
- `shell.overlay` — one dialog, portaled to `document.body`, closed by Escape,
  mask click, Cancel, or a successful save.

The dialog has three sections: reviewer source/model/effort, denied-call policy,
and presets (select, save-as, update, delete). Copy is registered through the
Client locale service in Chinese and English; all styling uses
`--dsw-alias-*` tokens with literal fallbacks so light and dark themes inherit
from the host.

## Unload behavior

On disposal the integration:

1. stops accepting new reviews;
2. migrates every live `auto` Session to `danger-full-access` through the
   permission-preset writer (the same migration the shipped integration uses);
3. aborts the integration signal and drains in-flight reviews.

While closing, a call that still resolves to `auto` returns `cancel`, and
in-flight reviews are aborted and drained. Sessions already migrated to
`danger-full-access` run without review until Auto review is selected again,
exactly as with the shipped integration.
