/**
 * Settings-store tests. Run: node test/settings.test.mjs
 */

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import os from 'node:os'
import {
  POLICY_ASK,
  POLICY_DENY,
  SettingsStore,
  builtinPresets,
  emptyConfig,
  isDefaultConfig,
  normalizeConfig,
} from '../lib/settings.js'

const root = await mkdtemp(join(os.tmpdir(), 'dba-settings-'))
const home = join(root, 'dsh-home')

try {
  // ------------------------------------------------------------ normalization
  assert.deepEqual(normalizeConfig(null), emptyConfig(), 'null normalizes to the empty config')
  assert.equal(isDefaultConfig(normalizeConfig({})), true, 'empty input is the shipped default')
  assert.deepEqual(
    normalizeConfig({
      reviewer: { provider: 'p', model: 'm', reasoningEffort: 'high' },
      onDenied: 'deny',
    }),
    { reviewer: { provider: 'p', model: 'm', reasoningEffort: 'high' }, onDenied: 'deny' },
    'complete config round-trips',
  )
  assert.deepEqual(
    normalizeConfig({ reviewer: { provider: 'p', model: null } }).reviewer,
    { provider: null, model: null, reasoningEffort: null },
    'a half-specified explicit route falls back to follow-session',
  )
  assert.equal(normalizeConfig({ onDenied: 'sometimes' }).onDenied, POLICY_ASK, 'unknown policy falls back to ask')

  // ------------------------------------------------------------- built-ins
  const builtins = builtinPresets()
  assert.equal(builtins.length, 2)
  assert.equal(builtins[0].config.onDenied, POLICY_ASK)
  assert.equal(builtins[1].config.onDenied, POLICY_DENY)
  assert.ok(builtins.every(preset => preset.builtIn === true && preset.id.startsWith('builtin:')))
  assert.deepEqual(builtinPresets(), builtins, 'built-ins are fresh, equal records')

  // ---------------------------------------------------------------- store
  const store = new SettingsStore({ home })
  assert.deepEqual(await store.listPresets(), builtins, 'a fresh store lists the built-ins')
  assert.equal(await store.getSession('s-1'), null, 'a fresh store has no session record')

  const saved = await store.setSession('s-1', {
    config: { reviewer: { provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'high' }, onDenied: 'deny' },
    presetId: 'builtin:follow-deny',
  })
  assert.equal(saved.config.reviewer.provider, 'deepseek')
  assert.equal(saved.presetId, 'builtin:follow-deny')
  assert.ok(saved.updatedAt > 0)

  const reread = await store.getSession('s-1')
  assert.deepEqual(reread, saved, 'a session record round-trips')

  // Detached reads: mutating a returned record cannot corrupt the store.
  reread.config.reviewer.model = 'tampered'
  assert.equal((await store.getSession('s-1')).config.reviewer.model, 'deepseek-flash')

  const onDisk = JSON.parse(await readFile(store.filePath, 'utf8'))
  assert.equal(onDisk.version, 1)
  assert.equal(onDisk.sessions['s-1'].config.onDenied, 'deny')

  // Persistence across instances.
  const second = new SettingsStore({ home })
  assert.deepEqual(await second.getSession('s-1'), saved, 'a new store instance reads the persisted record')

  // --------------------------------------------------------------- presets
  const created = await store.savePreset({
    name: 'Fast review',
    description: 'reviewer gpt',
    config: { reviewer: { provider: 'openai', model: 'gpt-5.2', reasoningEffort: 'medium' }, onDenied: 'ask' },
  })
  assert.ok(created.id.startsWith('p-'))
  assert.equal(created.builtIn, false)
  assert.equal((await store.listPresets()).length, 3)

  const updated = await store.savePreset({
    id: created.id,
    name: 'Fast review v2',
    description: '',
    config: { reviewer: { provider: 'openai', model: 'gpt-5.2', reasoningEffort: null }, onDenied: 'deny' },
  })
  assert.equal(updated.name, 'Fast review v2')
  assert.equal(updated.config.onDenied, 'deny')
  assert.equal((await store.findPreset(created.id)).name, 'Fast review v2')

  await assert.rejects(() => store.savePreset({ name: '', config: {} }), /名称/)
  await assert.rejects(() => store.savePreset({ name: 'x', id: 'builtin:follow-ask', config: {} }), /内置/)
  await assert.rejects(() => store.savePreset({ name: 'Fast review v2', config: {} }), /同名/)
  await assert.rejects(() => store.deletePreset('builtin:follow-ask'), /内置/)

  // Deleting a preset detaches every Session that referenced it.
  await store.setSession('s-preset', { config: created.config, presetId: created.id })
  assert.equal((await store.getSession('s-preset')).presetId, created.id)

  assert.equal(await store.deletePreset(created.id), true)
  assert.equal((await store.getSession('s-preset')).presetId, null, 'a deleted preset detaches its Sessions')
  assert.equal(await store.findPreset(created.id), null)
  assert.equal(await store.deletePreset(created.id), false)

  // ------------------------------------------------------- session clearing
  assert.equal(await store.clearSession('s-1'), true)
  assert.equal(await store.getSession('s-1'), null)
  assert.equal(await store.clearSession('s-1'), false)

  // ------------------------------------------------------ corrupt recovery
  await mkdir(join(home, 'storages', 'better-approve'), { recursive: true })
  await writeFile(store.filePath, '{ not json', 'utf8')
  const warnings = []
  const recovered = new SettingsStore({ home, onWarning: message => warnings.push(message) })
  assert.deepEqual(await recovered.listPresets(), builtins, 'a corrupt document falls back to the built-ins')
  assert.ok(warnings.some(message => message.includes('not valid JSON')), 'corruption is reported')
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('settings.test.mjs: ok')
