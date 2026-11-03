/**
 * dsh-better-approve — durable settings.
 *
 * Two kinds of state, one small JSON document under the DSH home:
 *
 * - `sessions[sessionId]`: the enhanced auto-review configuration bound to one
 *   Session (reviewer route + denied-call policy) plus the preset it was last
 *   applied from. A Session without a record uses {@link EMPTY_CONFIG}.
 * - `presets`: named configurations the user created. The two shipped
 *   built-in presets are computed, never stored, so they cannot be edited or
 *   deleted away.
 *
 * The record is user configuration, not model-visible conversation state, so
 * it lives in plugin storage rather than the Session log. Reads are detached
 * clones; writes are serialized and atomic (tmp + rename).
 *
 * @module dsh-better-approve/settings
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { dirname, join } from 'node:path'

/** Current on-disk schema version. */
export const STORE_VERSION = 1

/** Denied calls go back to the user for manual confirmation. */
export const POLICY_ASK = 'ask'
/** Denied calls are final; the review result returns to the requester. */
export const POLICY_DENY = 'deny'

/** Every accepted denied-call policy. */
export const DENIED_POLICIES = Object.freeze([POLICY_ASK, POLICY_DENY])

/** Presets older than this many Session records trim the oldest records. */
const SESSION_RECORD_CAP = 500
/** Hard cap on stored custom presets. */
const PRESET_CAP = 100
/** Longest accepted preset name. */
export const PRESET_NAME_MAX = 60
/** Longest accepted preset description. */
export const PRESET_DESCRIPTION_MAX = 240

/**
 * The enhanced-review configuration for one Session.
 * @typedef {object} SessionConfig
 * @property {{ provider: string|null, model: string|null, reasoningEffort: string|null }} reviewer
 *   Explicit reviewer route. Both `provider` and `model` are null to follow the
 *   Session's own route; `reasoningEffort` may still be set independently.
 * @property {'ask'|'deny'} onDenied
 *   What happens when the reviewer denies a call or the review itself fails.
 */

/**
 * The empty configuration: follow the Session route, ask the user on denial.
 * @returns {SessionConfig} a fresh detached configuration.
 */
export function emptyConfig() {
  return {
    reviewer: { provider: null, model: null, reasoningEffort: null },
    onDenied: POLICY_ASK,
  }
}

/** @param {unknown} value */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** @param {unknown} value */
function nonEmptyString(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text === '' ? null : text
}

/**
 * Normalize untrusted input into a complete configuration.
 * A half-specified explicit route falls back to "follow the Session route".
 * @param {unknown} input
 * @returns {SessionConfig} a fresh detached configuration.
 */
export function normalizeConfig(input) {
  const config = emptyConfig()
  if (!isRecord(input)) return config
  const reviewer = isRecord(input.reviewer) ? input.reviewer : {}
  config.reviewer.provider = nonEmptyString(reviewer.provider)
  config.reviewer.model = nonEmptyString(reviewer.model)
  config.reviewer.reasoningEffort = nonEmptyString(reviewer.reasoningEffort)
  if ((config.reviewer.provider === null) !== (config.reviewer.model === null)) {
    config.reviewer.provider = null
    config.reviewer.model = null
  }
  config.onDenied = input.onDenied === POLICY_DENY ? POLICY_DENY : POLICY_ASK
  return config
}

/**
 * Whether a configuration is the shipped default.
 * @param {SessionConfig} config
 * @returns {boolean}
 */
export function isDefaultConfig(config) {
  return config.reviewer.provider === null
    && config.reviewer.model === null
    && config.reviewer.reasoningEffort === null
    && config.onDenied === POLICY_ASK
}

/**
 * The shipped, non-deletable presets. Their names and descriptions are
 * translated by the Client through `nameKey` / `descriptionKey`; `name` is an
 * English fallback for non-Client consumers.
 * @returns {Array<object>} fresh built-in preset records.
 */
export function builtinPresets() {
  return [
    {
      id: 'builtin:follow-ask',
      builtIn: true,
      name: 'Follow session model · confirm',
      nameKey: 'preset.builtin.followAsk.name',
      descriptionKey: 'preset.builtin.followAsk.description',
      config: { reviewer: { provider: null, model: null, reasoningEffort: null }, onDenied: POLICY_ASK },
    },
    {
      id: 'builtin:follow-deny',
      builtIn: true,
      name: 'Follow session model · reject',
      nameKey: 'preset.builtin.followDeny.name',
      descriptionKey: 'preset.builtin.followDeny.description',
      config: { reviewer: { provider: null, model: null, reasoningEffort: null }, onDenied: POLICY_DENY },
    },
  ]
}

/**
 * Normalize one stored custom preset, dropping malformed records.
 * @param {unknown} input
 * @returns {object|null}
 */
function normalizeStoredPreset(input) {
  if (!isRecord(input)) return null
  const id = nonEmptyString(input.id)
  const name = nonEmptyString(input.name)
  if (id === null || name === null || !id.startsWith('p-')) return null
  const description = nonEmptyString(input.description) ?? ''
  const createdAt = typeof input.createdAt === 'number' && Number.isFinite(input.createdAt)
    ? input.createdAt : Date.now()
  const updatedAt = typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt)
    ? input.updatedAt : createdAt
  return {
    id,
    builtIn: false,
    name: name.slice(0, PRESET_NAME_MAX),
    description: description.slice(0, PRESET_DESCRIPTION_MAX),
    config: normalizeConfig(input.config),
    createdAt,
    updatedAt,
  }
}

/**
 * Normalize one stored Session record.
 * @param {unknown} input
 * @returns {{ config: SessionConfig, presetId: string|null, updatedAt: number }|null}
 */
function normalizeSessionRecord(input) {
  if (!isRecord(input)) return null
  const presetId = nonEmptyString(input.presetId)
  const updatedAt = typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt)
    ? input.updatedAt : 0
  return {
    config: normalizeConfig(input.config),
    presetId,
    updatedAt,
  }
}

/** The empty document. */
function emptyDocument() {
  return { version: STORE_VERSION, sessions: {}, presets: [] }
}

/**
 * Validate a stored document, keeping every well-formed record.
 * @param {unknown} input
 * @returns {{ version: number, sessions: Record<string, object>, presets: object[] }}
 */
function normalizeDocument(input) {
  if (!isRecord(input)) return emptyDocument()
  const sessions = {}
  const rawSessions = isRecord(input.sessions) ? input.sessions : {}
  for (const [sessionId, record] of Object.entries(rawSessions)) {
    if (typeof sessionId !== 'string' || sessionId === '') continue
    const normalized = normalizeSessionRecord(record)
    if (normalized !== null) sessions[sessionId] = normalized
  }
  const presets = []
  const seen = new Set()
  const rawPresets = Array.isArray(input.presets) ? input.presets : []
  for (const record of rawPresets) {
    const normalized = normalizeStoredPreset(record)
    if (normalized === null || seen.has(normalized.id)) continue
    seen.add(normalized.id)
    presets.push(normalized)
    if (presets.length >= PRESET_CAP) break
  }
  return { version: STORE_VERSION, sessions, presets }
}

/** Drop the oldest Session records beyond the cap. */
function trimSessions(sessions) {
  const entries = Object.entries(sessions)
  if (entries.length <= SESSION_RECORD_CAP) return
  entries.sort((left, right) => {
    const a = isRecord(left[1]) && typeof left[1].updatedAt === 'number' ? left[1].updatedAt : 0
    const b = isRecord(right[1]) && typeof right[1].updatedAt === 'number' ? right[1].updatedAt : 0
    return a - b
  })
  for (const [sessionId] of entries.slice(0, entries.length - SESSION_RECORD_CAP)) {
    delete sessions[sessionId]
  }
}

/** The DSH home directory the Host process runs under. */
export function defaultHome() {
  const home = process.env.DSH_HOME
  if (typeof home === 'string' && home.trim() !== '') return home
  return join(os.homedir(), '.dsh')
}

/** One serialized, atomic settings document. */
export class SettingsStore {
  /**
   * @param {{ home?: string, onWarning?: (message: string) => void }} [options]
   */
  constructor(options = {}) {
    this.home = options.home ?? defaultHome()
    this.onWarning = options.onWarning
    this.filePath = join(this.home, 'storages', 'better-approve', 'settings.json')
    /** @type {object|null} */
    this.data = null
    /** @type {Promise<object>|null} */
    this.loading = null
    /** @type {Promise<unknown>} */
    this.chain = Promise.resolve()
  }

  /** @param {string} message */
  warn(message) {
    try {
      this.onWarning?.(message)
    } catch {
      // A diagnostics sink must never break settings.
    }
  }

  /**
   * Load the document once.
   * @returns {Promise<object>} the live in-memory document.
   */
  async ready() {
    if (this.data !== null) return this.data
    if (this.loading === null) this.loading = this.load()
    return this.loading
  }

  /** @returns {Promise<object>} */
  async load() {
    let text
    try {
      text = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if (error?.code !== 'ENOENT') this.warn(`settings read failed: ${String(error?.message ?? error)}`)
      this.data = emptyDocument()
      return this.data
    }
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      this.warn(`settings file is not valid JSON: ${String(error?.message ?? error)}`)
      await this.backupCorruptFile()
      this.data = emptyDocument()
      return this.data
    }
    this.data = normalizeDocument(parsed)
    return this.data
  }

  /** Move one unreadable document aside instead of overwriting it silently. */
  async backupCorruptFile() {
    const target = `${this.filePath}.corrupt-${Date.now()}`
    try {
      await rename(this.filePath, target)
      this.warn(`settings file backed up to ${target}`)
    } catch (error) {
      this.warn(`settings backup failed: ${String(error?.message ?? error)}`)
    }
  }

  /**
   * Serialize one read-modify-write operation.
   * @template T
   * @param {() => Promise<T>} operation
   * @returns {Promise<T>}
   */
  enqueue(operation) {
    const run = this.chain.then(operation, operation)
    this.chain = run.then(() => undefined, () => undefined)
    return run
  }

  /**
   * Apply one mutation, persist the whole document, then publish it.
   * @template T
   * @param {(draft: object) => T|Promise<T>} mutate
   * @returns {Promise<T>}
   */
  async update(mutate) {
    return this.enqueue(async () => {
      const current = await this.ready()
      const draft = structuredClone(current)
      const result = await mutate(draft)
      trimSessions(draft.sessions)
      await this.persist(draft)
      this.data = draft
      return result
    })
  }

  /**
   * Write the document atomically.
   * @param {object} document
   */
  async persist(document) {
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`
    const payload = `${JSON.stringify(document, null, 2)}\n`
    await writeFile(temporary, payload, 'utf8')
    await rename(temporary, this.filePath)
  }

  /**
   * Read one Session's stored record.
   * @param {string} sessionId
   * @returns {Promise<{ config: SessionConfig, presetId: string|null, updatedAt: number }|null>}
   */
  async getSession(sessionId) {
    const data = await this.ready()
    const record = data.sessions[sessionId]
    return record === undefined ? null : structuredClone(record)
  }

  /**
   * Persist one Session's configuration.
   * @param {string} sessionId
   * @param {{ config: SessionConfig, presetId?: string|null }} input
   * @returns {Promise<{ config: SessionConfig, presetId: string|null, updatedAt: number }>}
   */
  async setSession(sessionId, input) {
    const config = normalizeConfig(input.config)
    const presetId = nonEmptyString(input.presetId)
    return this.update((draft) => {
      const record = { config, presetId, updatedAt: Date.now() }
      draft.sessions[sessionId] = record
      return structuredClone(record)
    })
  }

  /**
   * Forget one Session's configuration.
   * @param {string} sessionId
   * @returns {Promise<boolean>}
   */
  async clearSession(sessionId) {
    return this.update((draft) => {
      const existed = Object.hasOwn(draft.sessions, sessionId)
      delete draft.sessions[sessionId]
      return existed
    })
  }

  /**
   * Every selectable preset: built-ins first, then custom records.
   * @returns {Promise<object[]>}
   */
  async listPresets() {
    const data = await this.ready()
    return [...builtinPresets(), ...structuredClone(data.presets)]
  }

  /**
   * Resolve one preset by id.
   * @param {string} presetId
   * @returns {Promise<object|null>}
   */
  async findPreset(presetId) {
    const presets = await this.listPresets()
    return presets.find(preset => preset.id === presetId) ?? null
  }

  /**
   * Create or update one custom preset.
   * @param {{ id?: string|null, name: unknown, description?: unknown, config: unknown }} input
   * @returns {Promise<object>}
   */
  async savePreset(input) {
    const name = nonEmptyString(input.name)
    if (name === null) throw new Error('预设名称不能为空')
    if (name.length > PRESET_NAME_MAX) throw new Error(`预设名称不能超过 ${PRESET_NAME_MAX} 个字符`)
    const description = nonEmptyString(input.description) ?? ''
    if (description.length > PRESET_DESCRIPTION_MAX) throw new Error(`预设描述不能超过 ${PRESET_DESCRIPTION_MAX} 个字符`)
    const config = normalizeConfig(input.config)
    const presetId = nonEmptyString(input.id)
    return this.update((draft) => {
      const now = Date.now()
      if (presetId !== null) {
        if (presetId.startsWith('builtin:')) throw new Error('内置预设不能修改')
        const existing = draft.presets.find(preset => preset.id === presetId)
        if (existing === undefined) throw new Error('要修改的预设不存在')
        existing.name = name
        existing.description = description
        existing.config = structuredClone(config)
        existing.updatedAt = now
        return structuredClone(existing)
      }
      if (draft.presets.length >= PRESET_CAP) throw new Error(`最多保存 ${PRESET_CAP} 个预设`)
      if (draft.presets.some(preset => preset.name === name)) throw new Error('已存在同名预设')
      const created = {
        id: `p-${randomUUID()}`,
        builtIn: false,
        name,
        description,
        config: structuredClone(config),
        createdAt: now,
        updatedAt: now,
      }
      draft.presets.push(created)
      return structuredClone(created)
    })
  }

  /**
   * Remove one custom preset.
   * @param {string} presetId
   * @returns {Promise<boolean>}
   */
  async deletePreset(presetId) {
    if (presetId.startsWith('builtin:')) throw new Error('内置预设不能删除')
    return this.update((draft) => {
      const index = draft.presets.findIndex(preset => preset.id === presetId)
      if (index < 0) return false
      draft.presets.splice(index, 1)
      // A Session that referenced the removed preset must not keep a dangling
      // id: saving such a Session would be rejected as "preset no longer exists".
      for (const record of Object.values(draft.sessions)) {
        if (record.presetId === presetId) record.presetId = null
      }
      return true
    })
  }
}
