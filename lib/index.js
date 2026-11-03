/**
 * dsh-better-approve — Host half.
 *
 * Replaces the shipped experimental Auto review integration with an enhanced
 * one:
 *
 * - the reserved `auto` permission preset is registered here, so the Web
 *   permission picker keeps its existing entry;
 * - every native and PTC inner tool call is reviewed with the Session's
 *   configured reviewer route;
 * - a denial or a reviewer failure either asks the user (`ask`) or is finalized
 *   immediately with the review result (`deny`), per Session;
 * - an authenticated Remote API exposes status, provider/model/effort catalogs,
 *   Session-bound saves, and reusable presets to the Client half.
 *
 * @module dsh-better-approve
 */

import {
  SettingsStore,
  defaultHome,
  emptyConfig,
  normalizeConfig,
  POLICY_DENY,
} from './settings.js'
import {
  RUN_CODE_NAME,
  askUserDecision,
  deniedDecision,
  failureAskDecision,
  failureDecision,
  isAborted,
  runReview,
} from './review.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-better-approve'

/** Complete host services required before Auto may be advertised. */
export const inject = [
  'approval',
  'llm',
  'permissionPresets',
  'sessions',
  'tools',
  'workingDirectory',
]

/** Form one Remote invocation descriptor for this service. */
function remoteInvocation(method, parameters) {
  return {
    id: `${name}#betterApprove/${method}`,
    service: 'betterApprove',
    namespace: 'betterApprove',
    method,
    invocation: { kind: 'direct' },
    parameters: parameters.map(parameter => ({
      name: parameter,
      wire: parameter,
      source: 'json',
      codec: { mode: 'src-json' },
    })),
    result: { mode: 'src-json' },
  }
}

/** The complete Remote contribution for the Client half. */
const REMOTE_CONTRIBUTION = {
  package: name,
  face: 'host',
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: [
    remoteInvocation('status', ['sessionId']),
    remoteInvocation('providers', []),
    remoteInvocation('models', ['provider']),
    remoteInvocation('efforts', ['provider', 'model']),
    remoteInvocation('save', ['sessionId', 'config', 'presetId']),
    remoteInvocation('savePreset', ['preset']),
    remoteInvocation('deletePreset', ['presetId']),
    remoteInvocation('applyPreset', ['sessionId', 'presetId']),
    remoteInvocation('reset', ['sessionId']),
  ],
}

/**
 * Install the enhanced Auto review integration.
 * @param {object} ctx - the plugin's Cordis context.
 * @param {{ home?: string }} [config] - optional loader config (test/appliance use).
 */
export function apply(ctx, config = {}) {
  const store = new SettingsStore({
    home: typeof config?.home === 'string' && config.home !== '' ? config.home : defaultHome(),
    onWarning: message => ctx.logger?.warn?.(`better-approve: ${message}`),
  })
  const permissionPresets = ctx.permissionPresets
  let accepting = true
  const active = new Set()
  const lifecycle = new AbortController()

  /** Find one live Session by id. */
  function findSession(sessionId) {
    const needle = String(sessionId ?? '')
    if (needle === '') throw new Error('better-approve: a session id is required')
    const session = ctx.sessions.list().find(candidate => String(candidate.id) === needle)
    if (session === undefined) throw new Error('better-approve: the Session is not live')
    return session
  }

  /** Reject a reviewer route or effort the composed adapters cannot serve. */
  async function validateReviewer(reviewer, session) {
    let provider = reviewer.provider
    let model = reviewer.model
    if (provider === null || model === null) {
      // Follow the Session route. An effort chosen for that route is still
      // validated when the Session has already published its route.
      const header = session?.requestHeader?.()
      if (reviewer.reasoningEffort === null || header?.config === undefined) return
      provider = header.config.provider ?? null
      model = header.config.model ?? null
      if (provider === null || model === null) return
    }
    const info = await ctx.llm.resolveModelInfo(provider, model)
    if (reviewer.reasoningEffort === null) return
    const efforts = Array.isArray(info?.reasoning?.efforts) ? info.reasoning.efforts : []
    if (!efforts.some(effort => String(effort.id) === reviewer.reasoningEffort)) {
      throw new Error(
        `better-approve: model "${provider}/${model}" does not offer reasoning effort "${reviewer.reasoningEffort}"`,
      )
    }
  }

  /** One complete settings snapshot for the Client. */
  async function statusOf(session) {
    const sessionId = String(session.id)
    const [saved, presets] = await Promise.all([store.getSession(sessionId), store.listPresets()])
    const header = session.requestHeader()
    let preset
    try {
      preset = permissionPresets.current(session)
    } catch {
      preset = 'custom'
    }
    return {
      sessionId,
      preset,
      active: preset === 'auto',
      config: saved?.config ?? emptyConfig(),
      presetId: saved?.presetId ?? null,
      approvalPolicy: ctx.approval.overrideOf(session) ?? 'ask',
      presets,
      sessionRoute: header?.config === undefined
        ? null
        : {
          provider: header.config.provider ?? null,
          model: header.config.model ?? null,
          reasoningEffort: header.config.reasoningEffort ?? null,
        },
    }
  }

  // ------------------------------------------------------------ Remote API
  const api = {
    async status(sessionId) {
      return statusOf(findSession(sessionId))
    },

    providers() {
      const providers = ctx.llm.listProviders()
      return Array.isArray(providers) ? providers : []
    },

    async models(provider) {
      const models = await ctx.llm.listModels(String(provider))
      return Array.isArray(models) ? models : []
    },

    async efforts(provider, model) {
      try {
        const info = await ctx.llm.resolveModelInfo(String(provider), String(model))
        return {
          efforts: Array.isArray(info?.reasoning?.efforts) ? info.reasoning.efforts : [],
          defaultEffort: info?.reasoning?.defaultEffort ?? null,
        }
      } catch (error) {
        return {
          efforts: [],
          defaultEffort: null,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },

    async save(sessionId, input, presetId) {
      const session = findSession(sessionId)
      const normalized = normalizeConfig(input)
      await validateReviewer(normalized.reviewer, session)
      const resolvedPresetId = typeof presetId === 'string' && presetId !== '' ? presetId : null
      if (resolvedPresetId !== null && await store.findPreset(resolvedPresetId) === null) {
        throw new Error('better-approve: the selected preset no longer exists')
      }
      await store.setSession(String(session.id), { config: normalized, presetId: resolvedPresetId })
      return statusOf(session)
    },

    async savePreset(input) {
      const preset = input !== null && typeof input === 'object' ? input : {}
      const normalized = normalizeConfig(preset.config)
      await validateReviewer(normalized.reviewer)
      const saved = await store.savePreset({
        id: preset.id ?? null,
        name: preset.name,
        description: preset.description,
        config: normalized,
      })
      const presets = await store.listPresets()
      return { preset: saved, presets }
    },

    async deletePreset(presetId) {
      const removed = await store.deletePreset(String(presetId))
      if (!removed) throw new Error('better-approve: the preset does not exist')
      return { presets: await store.listPresets() }
    },

    async applyPreset(sessionId, presetId) {
      const session = findSession(sessionId)
      const preset = await store.findPreset(String(presetId))
      if (preset === null) throw new Error('better-approve: the preset does not exist')
      await store.setSession(String(session.id), {
        config: preset.config,
        presetId: preset.id,
      })
      return statusOf(session)
    },

    async reset(sessionId) {
      const session = findSession(sessionId)
      await store.clearSession(String(session.id))
      return statusOf(session)
    },
  }
  Object.defineProperty(api, 'typertRemote', {
    value: Object.freeze({ service: api, serviceKey: 'betterApprove', namespace: 'betterApprove' }),
  })
  ctx.provide('betterApprove', api)
  ctx.inject(['typert'], typert => typert.typert.register(REMOTE_CONTRIBUTION))

  // --------------------------------------------------------- review gate
  ctx.on('tools/pre-execute', async (exec, next) => {
    const agent = exec.agent
    if (agent === undefined || (exec.parent === undefined && exec.name === RUN_CODE_NAME)) return next()
    let preset
    try {
      preset = permissionPresets.current(agent.session)
    } catch (error) {
      // A missing/withdrawing permissions projection must not break tool calls.
      ctx.logger?.warn?.(`better-approve: permission state unavailable: ${String(error)}`)
      return next()
    }
    if (preset !== 'auto') return next()
    if (!accepting || lifecycle.signal.aborted) return { kind: 'cancel' }

    const completed = Promise.withResolvers()
    active.add(completed.promise)
    try {
      const signal = AbortSignal.any([exec.signal, lifecycle.signal])
      let record = null
      try {
        record = await store.getSession(String(agent.session.id))
      } catch (error) {
        // Storage trouble must not silently turn into an approval bypass: keep
        // the shipped default (follow the Session model, ask the user).
        ctx.logger?.warn?.(`better-approve: settings unavailable: ${String(error)}`)
      }
      const reviewer = record?.config.reviewer
      const policy = record?.config.onDenied === POLICY_DENY ? POLICY_DENY : 'ask'
      let review
      try {
        review = { ok: true, value: await runReview({ ctx, agent, exec, signal, reviewer }) }
      } catch (error) {
        review = { ok: false, error }
      }
      if (isAborted(lifecycle.signal)) return { kind: 'cancel' }
      if (isAborted(exec.signal)) return { kind: 'cancel' }

      if (!review.ok) {
        // A technical failure is not a risk judgment: keep every downstream
        // gate's own decision first, then ask or finalize by Session policy.
        if (policy === POLICY_DENY || ctx.approval.overrideOf(agent.session) === 'never') {
          return failureDecision(exec, review.error)
        }
        const downstream = await next()
        if (isAborted(lifecycle.signal)) return { kind: 'cancel' }
        if (downstream.kind !== 'allow') return downstream
        return failureAskDecision(exec, review.error)
      }

      const { decision } = review.value
      if (decision.decision === 'deny') {
        if (policy === POLICY_DENY || ctx.approval.overrideOf(agent.session) === 'never') {
          return deniedDecision(exec, decision)
        }
        const downstream = await next()
        if (isAborted(lifecycle.signal)) return { kind: 'cancel' }
        if (downstream.kind !== 'allow') return downstream
        return askUserDecision(exec, decision.reason)
      }

      const downstream = await next()
      if (isAborted(lifecycle.signal)) return { kind: 'cancel' }
      return downstream
    } finally {
      active.delete(completed.promise)
      completed.resolve()
    }
  }, { prepend: true })

  const stopContribution = permissionPresets.registerAuto(() => {
    if (!accepting) throw new Error('better-approve: integration is closing')
  })
  ctx.effect(() => () => stopContribution(), 'better-approve: auto preset contribution')

  ctx.effect(() => async () => {
    accepting = false
    try {
      for (const session of ctx.sessions.list()) {
        let preset
        try {
          preset = permissionPresets.current(session)
        } catch {
          continue
        }
        if (preset !== 'auto') continue
        try {
          permissionPresets.set(session, 'danger-full-access')
        } catch (error) {
          ctx.logger?.warn?.(`better-approve: failed to migrate a live Auto Session: ${String(error)}`)
        }
      }
    } finally {
      lifecycle.abort(new Error('better-approve integration disposed'))
      await Promise.allSettled([...active])
    }
  }, 'better-approve: lifecycle')
}
