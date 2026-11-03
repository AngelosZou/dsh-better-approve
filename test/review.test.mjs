/**
 * Review-engine and host-integration tests. Run: node test/review.test.mjs
 *
 * The review engine is a port of the shipped Auto review reviewer, so these
 * tests cover the safety protocol, the request shape (no `temperature`), and
 * the two denied-call policies end to end through the real plugin `apply()`.
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import os from 'node:os'
import {
  REVIEW_POLICY,
  askUserDecision,
  deniedDecision,
  parseDecision,
  readDecision,
  resolveReviewerRoute,
  reviewRequestOptions,
  reviewUserText,
  runReview,
} from '../lib/review.js'
import { apply as applyHost } from '../lib/index.js'
import { emptyConfig } from '../lib/settings.js'

const root = await mkdtemp(join(os.tmpdir(), 'dba-review-'))

// --------------------------------------------------------------- protocol
assert.deepEqual(parseDecision('{"risk":"low","decision":"allow"}'), { risk: 'low', decision: 'allow' })
assert.deepEqual(parseDecision('{"risk":"medium","decision":"allow"}'), { risk: 'medium', decision: 'allow' })
assert.deepEqual(
  parseDecision('{"risk":"medium","decision":"deny","reason":"needs authorization"}'),
  { risk: 'medium', decision: 'deny', reason: 'needs authorization' },
)
assert.deepEqual(parseDecision('{"risk":"high","decision":"deny"}'), { risk: 'high', decision: 'deny' })

for (const invalid of [
  '{"risk":"low","decision":"deny"}',
  '{"risk":"high","decision":"allow"}',
  '{"risk":"medium","decision":"allow","reason":"x"}',
  '{"risk":"low","decision":"allow","extra":1}',
  '{"risk":"medium","decision":"deny","reason":1}',
  '[]',
  'null',
]) {
  assert.throws(() => parseDecision(invalid), /better-approve/, `rejected ${invalid}`)
}
assert.throws(
  () => parseDecision('{"risk":"low","risk":"medium","decision":"allow"}'),
  /repeats a JSON member/,
)

// ---------------------------------------------------------------- streams
/** @param {{type: string, text?: string}[]} blocks */
async function* decisionStream(text) {
  yield { type: 'block-start', index: 0, blockType: 'reasoning' }
  yield { type: 'reasoning-delta', index: 0, text: 'thinking' }
  yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'thinking' } }
  yield { type: 'block-start', index: 1, blockType: 'text' }
  yield { type: 'text-delta', index: 1, text: text.slice(0, 5) }
  yield { type: 'text-delta', index: 1, text: text.slice(5) }
  yield { type: 'block-end', index: 1, block: { type: 'text', text } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

async function* failingStream(code, message) {
  yield { type: 'finish', reason: { kind: 'error', failure: { code, message } } }
}

assert.deepEqual(
  await readDecision(decisionStream('{"risk":"low","decision":"allow"}')),
  { risk: 'low', decision: 'allow' },
)
await assert.rejects(
  () => readDecision(failingStream('INVALID_REQUEST', "Unsupported parameter: 'temperature' is not supported with this model.")),
  /INVALID_REQUEST.*temperature/,
)

async function* textOnly() {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'block-end', index: 0, block: { type: 'text', text: '{"risk":"low","decision":"allow"}' } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}
assert.deepEqual(await readDecision(textOnly()), { risk: 'low', decision: 'allow' })

async function* toolCall() {
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'c', name: 'x', arguments: '{}' } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}
await assert.rejects(() => readDecision(toolCall()), /exactly one text block/)

// ------------------------------------------------------------ request shape
const snapshot = {
  provider: 'session-provider',
  model: 'session-model',
  cwd: '/proj',
  projectInstructions: [],
  history: [],
  action: { mode: 'native', name: 'write', description: 'w', parameters: {}, arguments: {} },
}
assert.match(reviewUserText(snapshot), /ENVIRONMENT[\s\S]*PENDING_ACTION/)
assert.deepEqual(
  resolveReviewerRoute(snapshot, { provider: 'openai', model: 'gpt-5.2', reasoningEffort: 'high' }),
  { provider: 'openai', model: 'gpt-5.2', reasoningEffort: 'high' },
)
assert.deepEqual(
  resolveReviewerRoute(snapshot, { provider: null, model: null, reasoningEffort: null }),
  { provider: 'session-provider', model: 'session-model' },
)
assert.throws(() => resolveReviewerRoute({ provider: '', model: '' }, undefined), /no reviewer route/)

const options = reviewRequestOptions({
  snapshot,
  route: { provider: 'openai', model: 'gpt-5.2', reasoningEffort: 'medium' },
  signal: new AbortController().signal,
})
assert.equal(options.provider, 'openai')
assert.equal(options.model, 'gpt-5.2')
assert.equal(options.system, REVIEW_POLICY)
assert.equal(options.reasoningEffort, 'medium')
assert.equal(Object.hasOwn(options, 'temperature'), false, 'temperature is never sent')
assert.equal(options.messages.length, 1)

// ----------------------------------------------------- fake Session surface
function makeSession() {
  const events = []
  const put = (seq, type, data) => { events[seq] = { type, seq, time: seq, data } }
  put(0, 'user/message', {
    role: 'user',
    content: [{ type: 'text', text: 'Please write the report' }],
    source: { kind: 'user', rpcId: 'rpc-1' },
  })
  put(1, 'turn/start', { turn: 1 })
  put(2, 'step/start', { turn: 1, step: 1 })
  put(3, 'assistant/message', {
    turn: 1,
    step: 1,
    message: {
      role: 'assistant',
      content: [{ type: 'tool-call', id: 'call-1', name: 'write', arguments: '{"path":"a.txt"}' }],
      source: { kind: 'model', provider: 'p', model: 'm' },
    },
    stream: [],
  })
  put(4, 'tool/call', { turn: 1, step: 1, callId: 'call-1', name: 'write', arguments: '{"path":"a.txt"}' })
  return {
    id: 's-1',
    header: { origin: undefined, parentSession: undefined },
    surface: { nodes: [0, 3] },
    snapshotEvents: () => events,
    isOwnSeq: () => true,
    requestHeader: () => ({
      config: { provider: 'p', model: 'm' },
      tools: [{
        name: 'write',
        description: 'Write a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } } },
      }],
    }),
  }
}

const session = makeSession()
const agent = { session }
const exec = {
  name: 'write',
  arguments: { path: 'a.txt' },
  rootCallId: 'call-1',
  callId: 'call-1',
  parent: undefined,
  agent,
  signal: new AbortController().signal,
}

// ---------------------------------------------------- plugin integration
function makeHarness() {
  let currentPreset = 'auto'
  let approvalPolicy = 'ask'
  let streamFactory = () => decisionStream('{"risk":"low","decision":"allow"}')
  const captured = []
  const listeners = []
  const provided = {}
  const effects = []
  const ctx = {
    logger: { warn() {} },
    sessions: { list: () => [session] },
    permissionPresets: {
      current: () => currentPreset,
      registerAuto: () => async () => {},
      set: () => {},
    },
    approval: { overrideOf: () => approvalPolicy },
    workingDirectory: { ensure: async () => '/proj' },
    tools: {},
    llm: {
      stream(options) {
        captured.push(options)
        return streamFactory()
      },
      listProviders: () => [{ id: 'openai', name: 'OpenAI' }],
      listModels: async () => [{ id: 'gpt-5.2', name: 'GPT-5.2' }],
      resolveModelInfo: async () => ({
        reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'medium', name: 'Medium' }], defaultEffort: 'medium' },
      }),
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') effects.push(dispose)
      return () => {}
    },
    on(event, listener) {
      listeners.push({ event, listener })
      return () => {}
    },
    inject(names, callback) {
      if (names.includes('typert')) callback({ typert: { register() {} } })
    },
    provide(key, value) { provided[key] = value; return () => {} },
  }
  applyHost(ctx, { home: join(root, 'harness') })
  const gate = listeners.find(entry => entry.event === 'tools/pre-execute').listener
  return {
    ctx,
    provided,
    captured,
    gate,
    setPreset(value) { currentPreset = value },
    setApproval(value) { approvalPolicy = value },
    setStream(factory) { streamFactory = factory },
  }
}

const harness = makeHarness()
const api = harness.provided.betterApprove
assert.ok(api, 'the Remote service is provided')

// Providers/models/efforts surface.
assert.deepEqual(api.providers(), [{ id: 'openai', name: 'OpenAI' }])
assert.deepEqual(await api.models('openai'), [{ id: 'gpt-5.2', name: 'GPT-5.2' }])
assert.deepEqual((await api.efforts('openai', 'gpt-5.2')).efforts.map(e => e.id), ['high', 'medium'])

// Save a deny policy for this Session.
const savedStatus = await api.save('s-1', {
  reviewer: { provider: 'openai', model: 'gpt-5.2', reasoningEffort: 'high' },
  onDenied: 'deny',
}, null)
assert.equal(savedStatus.config.reviewer.provider, 'openai')
assert.equal(savedStatus.config.onDenied, 'deny')
assert.equal(savedStatus.active, true)
assert.equal(savedStatus.approvalPolicy, 'ask')

// Reject an unsupported effort.
await assert.rejects(
  () => api.save('s-1', {
    reviewer: { provider: 'openai', model: 'gpt-5.2', reasoningEffort: 'ultra' },
    onDenied: 'deny',
  }, null),
  /does not offer reasoning effort/,
)

// A reviewer allow delegates to the downstream decision and sends the configured
// route with no temperature.
let downstreamCalls = 0
const downstream = async () => { downstreamCalls += 1; return { kind: 'allow' } }
harness.setStream(() => decisionStream('{"risk":"low","decision":"allow"}'))
let decision = await harness.gate(exec, downstream)
assert.equal(decision.kind, 'allow')
assert.equal(downstreamCalls, 1)
assert.equal(harness.captured[0].provider, 'openai')
assert.equal(harness.captured[0].model, 'gpt-5.2')
assert.equal(harness.captured[0].reasoningEffort, 'high')
assert.equal(Object.hasOwn(harness.captured[0], 'temperature'), false)

// Policy deny: a reviewer denial is final and carries the review result.
harness.setStream(() => decisionStream('{"risk":"medium","decision":"deny","reason":"needs explicit authorization"}'))
downstreamCalls = 0
decision = await harness.gate(exec, downstream)
assert.equal(decision.kind, 'deny')
assert.equal(downstreamCalls, 0, 'a finalized denial never delegates')
assert.equal(decision.info.code, 'AUTO_REVIEW_DENIED')
assert.match(decision.reason, /risk: medium/)
assert.match(decision.reason, /needs explicit authorization/)

// Policy ask: the same denial becomes a user confirmation.
await api.save('s-1', emptyConfig(), null)
harness.setStream(() => decisionStream('{"risk":"medium","decision":"deny","reason":"scope unclear"}'))
downstreamCalls = 0
decision = await harness.gate(exec, downstream)
assert.equal(decision.kind, 'ask')
assert.equal(downstreamCalls, 1)
assert.match(decision.displayReason.zh, /scope unclear/)
assert.match(decision.displayReason.en, /scope unclear/)

// A downstream denial still wins over the reviewer's ask.
downstreamCalls = 0
decision = await harness.gate(exec, async () => { downstreamCalls += 1; return { kind: 'deny', reason: 'blocked' } })
assert.equal(decision.kind, 'deny')
assert.equal(decision.reason, 'blocked')

// Under the never approval policy an ask cannot happen: finalize the denial.
harness.setApproval('never')
decision = await harness.gate(exec, async () => ({ kind: 'allow' }))
assert.equal(decision.kind, 'deny')
assert.equal(decision.info.code, 'AUTO_REVIEW_DENIED')
harness.setApproval('ask')

// Reviewer failure under ask policy asks the user; under deny policy it fails closed.
harness.setStream(() => failingStream('INVALID_REQUEST', "Unsupported parameter: 'temperature' is not supported with this model."))
downstreamCalls = 0
decision = await harness.gate(exec, downstream)
assert.equal(decision.kind, 'ask')
assert.equal(downstreamCalls, 1)
assert.match(decision.displayReason.zh, /temperature/)

harness.setStream(() => failingStream('INVALID_REQUEST', 'boom'))
await api.save('s-1', { reviewer: { provider: null, model: null, reasoningEffort: null }, onDenied: 'deny' }, null)
downstreamCalls = 0
decision = await harness.gate(exec, downstream)
assert.equal(decision.kind, 'deny')
assert.equal(downstreamCalls, 0)
assert.match(decision.reason, /Auto review of tool "write" failed/)
assert.match(decision.reason, /boom/)

// Non-auto Sessions and the outer run_code transport skip the gate entirely.
harness.setPreset('workspace-write')
const before = harness.captured.length
downstreamCalls = 0
decision = await harness.gate(exec, async () => { downstreamCalls += 1; return { kind: 'allow' } })
assert.equal(decision.kind, 'allow')
assert.equal(downstreamCalls, 1)
assert.equal(harness.captured.length, before, 'no reviewer call outside auto')

harness.setPreset('auto')
decision = await harness.gate({ ...exec, name: 'run_code', parent: undefined }, async () => ({ kind: 'allow' }))
assert.equal(decision.kind, 'allow')
assert.equal(harness.captured.length, before, 'the outer run_code transport is not reviewed')

// Presets: create, list, apply to this Session.
const presetResult = await api.savePreset({
  name: 'Strict GPT',
  description: 'gpt strict',
  config: { reviewer: { provider: 'openai', model: 'gpt-5.2', reasoningEffort: 'medium' }, onDenied: 'deny' },
})
const presetId = presetResult.preset.id
assert.ok(presetResult.presets.some(preset => preset.id === presetId))
const applied = await api.applyPreset('s-1', presetId)
assert.equal(applied.presetId, presetId)
assert.equal(applied.config.onDenied, 'deny')
assert.equal(applied.config.reviewer.model, 'gpt-5.2')

const deleted = await api.deletePreset(presetId)
assert.equal(deleted.presets.some(preset => preset.id === presetId), false)
await assert.rejects(() => api.deletePreset('builtin:follow-ask'), /内置/)

// Reset clears the Session binding.
const reset = await api.reset('s-1')
assert.equal(reset.presetId, null)
assert.equal(reset.config.onDenied, 'ask')
assert.deepEqual(reset.config, emptyConfig())

// ------------------------------------------------------------ pure helpers
assert.equal(deniedDecision({ name: 'x' }, { risk: 'high', decision: 'deny' }).kind, 'deny')
assert.equal(askUserDecision({ name: 'x' }, 'why').kind, 'ask')

await rm(root, { recursive: true, force: true })
console.log('review.test.mjs: ok')
