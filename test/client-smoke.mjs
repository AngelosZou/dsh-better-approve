/**
 * Client-half smoke test: load the real factory bundle against a React shim and
 * mock services, then verify the locale dictionaries and both slot
 * registrations. Does not require the DSH runtime.
 * Run: node test/client-smoke.mjs
 */

import assert from 'node:assert/strict'

const effects = []
const required = []

const ReactShim = {
  createElement(type, props, ...children) {
    const merged = Object.assign({}, props || {})
    const children2 = children.flat(Infinity)
    if (children2.length > 0) merged.children = children2
    if (typeof type === 'function') return type(merged)
    return { type, props: merged, children: children2 }
  },
  useSyncExternalStore(_subscribe, getSnapshot) {
    return getSnapshot()
  },
  useEffect(fn) {
    effects.push(fn)
  },
  useRef(initial) {
    return { current: initial }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, function () {}]
  },
}

const ReactDOMShim = {
  createPortal(node) {
    return node
  },
}

let bundle = null
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      bundle = spec
    },
  },
}

await import('../lib/client.js')

assert.ok(bundle !== null, 'the factory bundle registered')
assert.equal(bundle.id, 'dsh-better-approve')

const module = bundle.factory((id) => {
  required.push(id)
  if (id === 'react') return ReactShim
  if (id === 'react-dom') return ReactDOMShim
  throw new Error(`unexpected require(${id})`)
})

assert.equal(module.name, 'dsh-better-approve')
assert.ok(module.inject.includes('slots') && module.inject.includes('connection') && module.inject.includes('locale'))
assert.deepEqual(required, ['react', 'react-dom'], 'the client loads no Harness Client package')

// ------------------------------------------------------------------ mocks
const registrations = []
const dictionaries = {}
const rpcCalls = []
const listeners = new Set()
let openState = false

const mockCtx = {
  slots: {
    inject(key, callback) {
      const registration = callback()
      registrations.push({ key, registration })
      return () => {}
    },
    register(options, render) {
      return { options, render }
    },
  },
  connection: {
    rpc: {
      call(channel, endpoint, payload) {
        rpcCalls.push({ channel, endpoint, args: payload })
        const args = payload.args
        if (endpoint === 'betterApprove/status') {
          return Promise.resolve({
            ok: true,
            value: {
              sessionId: args.sessionId,
              preset: 'auto',
              active: true,
              approvalPolicy: 'ask',
              config: { reviewer: { provider: null, model: null, reasoningEffort: null }, onDenied: 'ask' },
              presetId: null,
              sessionRoute: { provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'high' },
              presets: [
                {
                  id: 'builtin:follow-ask',
                  builtIn: true,
                  name: 'Follow session model · confirm',
                  nameKey: 'preset.builtin.followAsk.name',
                  descriptionKey: 'preset.builtin.followAsk.description',
                  config: { reviewer: { provider: null, model: null, reasoningEffort: null }, onDenied: 'ask' },
                },
              ],
            },
          })
        }
        if (endpoint === 'betterApprove/save') {
          return Promise.resolve({
            ok: true,
            value: {
              sessionId: args.sessionId,
              preset: 'auto',
              active: true,
              approvalPolicy: 'ask',
              config: args.config,
              presetId: args.presetId,
              sessionRoute: { provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'high' },
              presets: [],
            },
          })
        }
        return Promise.resolve({ ok: true, value: {} })
      },
    },
  },
  locale: {
    register(namespace, dicts) {
      dictionaries[namespace] = dicts
      return () => {}
    },
    bind(namespace) {
      return (key, params) => {
        const dict = dictionaries[namespace] && dictionaries[namespace].zh
        let text = dict && dict[key] !== undefined ? dict[key] : key
        if (params) {
          Object.keys(params).forEach((name) => {
            text = text.split(`{${name}}`).join(String(params[name]))
          })
        }
        return text
      }
    },
  },
  effect(fn) {
    const dispose = fn()
    return () => { if (typeof dispose === 'function') dispose() }
  },
}

// One shared-bound translator the slots would synthesize from `locale: NS`.
const bridge = (key, params) => {
  const dict = dictionaries['better-approve'] && dictionaries['better-approve'].zh
  let text = dict && dict[key] !== undefined ? dict[key] : key
  if (params) {
    Object.keys(params).forEach((name) => {
      text = text.split(`{${name}}`).join(String(params[name]))
    })
  }
  return text
}

// Minimal document surface: the plugin inserts one stylesheet on apply, and the
// dialog portals into document.body.
globalThis.document = {
  head: { appendChild() {} },
  body: {},
  getElementById() { return null },
  createElement() {
    return {
      id: '', textContent: '', parentNode: null,
      removeChild() {},
    }
  },
  addEventListener() {},
  removeEventListener() {},
}

module.apply(mockCtx)

// -------------------------------------------------------------- dictionary
const dicts = dictionaries['better-approve']
assert.ok(dicts && dicts.zh && dicts.en, 'bilingual dictionaries registered')
assert.deepEqual(Object.keys(dicts.zh).sort(), Object.keys(dicts.en).sort(), 'zh and en key sets match')
assert.equal(bridge('dialog.title'), '自动审查设置')

// ------------------------------------------------------------- registrations
const chipRegistration = registrations.find(entry => entry.key === 'conversation.input.left')
const overlayRegistration = registrations.find(entry => entry.key === 'shell.overlay')
assert.ok(chipRegistration, 'the composer control registered')
assert.ok(overlayRegistration, 'the dialog registered')
assert.equal(chipRegistration.registration.options.id, 'better-approve')
assert.equal(chipRegistration.registration.options.locale, 'better-approve')

// The control vanishes unless the Session preset is `auto`.
const hidden = chipRegistration.registration.render({
  sessionId: 's-1',
  t: bridge,
  useProjection: () => ({ currentValue: 'workspace-write' }),
})
assert.equal(hidden, null)

const shown = chipRegistration.registration.render({
  sessionId: 's-1',
  t: bridge,
  useProjection: () => ({ currentValue: 'auto' }),
})
assert.ok(shown !== null && shown.type === 'button', 'an auto Session renders the control')
assert.equal(shown.props.className, 'dba-chip')
const label = shown.children[1]
assert.equal([].concat(label.props.children).join(''), '审查设置')

// The overlay renders nothing while closed.
const closed = overlayRegistration.registration.render({ t: bridge })
assert.equal(closed, null)

// Open the dialog through the control, let the status read settle, and render
// the real form. This catches render-time defects in the modal tree.
shown.props.onClick()
await new Promise(resolve => setTimeout(resolve, 0))
await new Promise(resolve => setTimeout(resolve, 0))
const opened = overlayRegistration.registration.render({ t: bridge })
assert.ok(opened !== null, 'the dialog renders once opened')
assert.equal(opened.props.className, 'dba-root')
const dialog = opened.children[1]
assert.equal(dialog.props.className, 'dba-dialog')
assert.equal(dialog.props.role, 'dialog')
const header = dialog.children[0]
assert.equal([].concat(header.children[0].children[0].props.children).join(''), '自动审查设置')
const body = dialog.children[1]
assert.ok(Array.isArray(body.props.children) || body.props.children !== null, 'the settings body renders')
const footer = dialog.children[2]
assert.equal(footer.props.className, 'dba-footer')

// Every settings section is present in the rendered tree.
for (const text of ['审查模型', '未通过时', '预设', '跟随当前会话模型', '交由我手动确认']) {
  assert.ok(findByText(opened, text) !== null, `the dialog shows "${text}"`)
}

// The explicit-model branch renders the provider/model pickers; following the
// Session model restores the note.
const customOption = findByText(opened, '指定模型', 'button')
assert.ok(customOption !== null, 'the explicit-model option is rendered')
customOption.props.onClick()
await new Promise(resolve => setTimeout(resolve, 0))
await new Promise(resolve => setTimeout(resolve, 0))
const explicit = overlayRegistration.registration.render({ t: bridge })
assert.ok(findByText(explicit, '选择提供方') !== null, 'the provider picker renders')
assert.ok(findByText(explicit, '选择模型') !== null, 'the model picker renders')
const followOption = findByText(explicit, '跟随当前会话模型', 'button')
followOption.props.onClick()
const followed = overlayRegistration.registration.render({ t: bridge })
assert.ok(findByText(followed, '当前会话模型') !== null, 'the follow-session note renders')

// Switch the denied-call policy and save; the dialog closes on success.
const denyOption = findByText(followed, '直接拒绝并返回审查结果', 'button')
assert.ok(denyOption !== null, 'the reject policy option is rendered')
denyOption.props.onClick()
const edited = overlayRegistration.registration.render({ t: bridge })
const saveButton = findByExactButtonText(edited, '保存')
assert.ok(saveButton !== null, 'the save button is rendered after editing')
saveButton.props.onClick()
await new Promise(resolve => setTimeout(resolve, 0))
await new Promise(resolve => setTimeout(resolve, 0))
const saveCall = rpcCalls.find(call => call.endpoint === 'betterApprove/save')
assert.ok(saveCall !== undefined, 'save reached the Host')
assert.equal(saveCall.args.args.config.onDenied, 'deny')
assert.equal(saveCall.args.args.sessionId, 's-1')
assert.equal(overlayRegistration.registration.render({ t: bridge }), null, 'the dialog closes after saving')

// The chip reflects the saved policy after the Host round-trip.
const savedChip = chipRegistration.registration.render({
  sessionId: 's-1',
  t: bridge,
  useProjection: () => ({ currentValue: 'auto' }),
})
assert.ok(findByText(savedChip, '直接拒绝') !== null, 'the control shows the saved policy')

console.log('client-smoke.mjs: ok')

/** Depth-first walk over the element shim tree. */
function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  visit(node)
  const children = Array.isArray(node.children) ? node.children : []
  for (const child of children) walk(child, visit)
}

function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object') return textOf(node.children || [])
  return ''
}

function findByText(node, text, tag) {
  let found = null
  walk(node, (candidate) => {
    if (found !== null) return
    if (tag !== undefined && candidate.type !== tag) return
    if (textOf(candidate).includes(text)) found = candidate
  })
  return found
}

function findByExactButtonText(node, text) {
  let found = null
  walk(node, (candidate) => {
    if (found !== null || candidate.type !== 'button') return
    if (textOf(candidate).trim() === text) found = candidate
  })
  return found
}
