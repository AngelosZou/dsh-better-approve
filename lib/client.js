/**
 * dsh-better-approve — Client half.
 *
 * A compact reviewer control in the composer tool row (only while the
 * Session's permission preset is `auto`) plus one native-style dialog under
 * `shell.overlay`:
 *
 * - reviewer source: follow the Session's own model, or an explicit provider /
 *   model / reasoning effort;
 * - denied-call handling: ask the user, or reject immediately and return the
 *   review result;
 * - reusable presets stored by the Host and applied to the current Session.
 *
 * All state comes from the Host half over the shared RPC channel. Copy goes
 * through the Client locale service (zh + en), and every visual follows the
 * `--dsw-alias-*` theme tokens so the dialog matches the Harness UI in light
 * and dark themes.
 */

window.__ModuleLoader__.load({
  id: 'dsh-better-approve',
  factory: function (require) {
    var React = require('react')
    var ReactDOM = require('react-dom')
    var h = React.createElement

    var NS = 'better-approve'

    var zhDict = {
      'chip.label': '审查设置',
      'chip.sessionModel': '会话模型',
      'chip.title': '自动审查：{model} · {policy}',
      'short.ask': '手动确认',
      'short.deny': '直接拒绝',
      'dialog.title': '自动审查设置',
      'dialog.subtitle': '以下设置仅对当前会话生效；可保存为预设，在其他会话直接选择。',
      'dialog.close': '关闭',
      'dialog.cancel': '取消',
      'dialog.save': '保存',
      'dialog.saving': '保存中…',
      'dialog.loading': '加载中…',
      'dialog.retry': '重试',
      'dialog.reset': '恢复默认',
      'dialog.inactive': '当前会话未启用自动审查；设置会在下次启用后生效。',
      'section.model': '审查模型',
      'section.model.desc': '默认跟随当前会话的模型；也可以为审查单独指定模型。',
      'section.policy': '未通过时',
      'section.policy.desc': '审查拒绝或审查失败时如何处理这次工具调用。',
      'section.preset': '预设',
      'section.preset.desc': '预设保存在本机，应用到会话后仍可继续微调。',
      'source.follow': '跟随当前会话模型',
      'source.follow.desc': '使用当前会话正在使用的模型与提供方。',
      'source.custom': '指定模型',
      'source.custom.desc': '为审查单独选择提供方和模型。',
      'route.follow': '当前会话模型：{model}',
      'route.unknown': '当前会话还没有模型信息，发送一条消息后即可选择思考强度。',
      'provider.label': '提供方',
      'provider.placeholder': '选择提供方',
      'model.label': '模型',
      'model.placeholder': '选择模型',
      'model.loading': '模型加载中…',
      'model.loadFailed': '模型列表加载失败',
      'effort.label': '思考强度',
      'effort.default': '默认（模型自身设置）',
      'effort.loading': '思考强度加载中…',
      'effort.unsupported': '{effort}（当前模型未声明）',
      'effort.hint': '只在审查模型支持时传入；不选则使用模型默认值。',
      'policy.ask.title': '交由我手动确认',
      'policy.ask.desc': '审查拒绝时暂停这次调用，由你决定是否允许执行。',
      'policy.deny.title': '直接拒绝并返回审查结果',
      'policy.deny.desc': '审查拒绝时立即阻止调用，并把审查结果返回给请求者，不再询问你。',
      'policy.neverNote': '当前会话的审批策略为“不询问”，因此“手动确认”也会直接按拒绝处理。',
      'preset.placeholder': '不使用预设',
      'preset.choose': '选择预设',
      'preset.builtin': '内置',
      'preset.dirty': '当前设置已相对预设修改；可更新预设或另存为新预设。',
      'preset.saveAs': '保存为预设',
      'preset.update': '更新当前预设',
      'preset.delete': '删除当前预设',
      'preset.name': '预设名称',
      'preset.description': '描述',
      'preset.namePlaceholder': '例如：快速审查',
      'preset.descriptionPlaceholder': '描述（可选）',
      'preset.save': '保存预设',
      'preset.saving': '保存中…',
      'preset.cancel': '取消',
      'preset.confirmDelete': '确定删除预设“{name}”吗？',
      'preset.nameRequired': '请输入预设名称。',
      'preset.builtin.followAsk.name': '跟随会话模型 · 手动确认',
      'preset.builtin.followAsk.description': '审查与当前会话使用同一模型；拒绝时由你手动确认。',
      'preset.builtin.followDeny.name': '跟随会话模型 · 直接拒绝',
      'preset.builtin.followDeny.description': '审查与当前会话使用同一模型；拒绝时直接阻止并返回结果。',
      'error.load': '加载设置失败：{message}',
      'error.save': '保存失败：{message}',
      'error.preset': '预设操作失败：{message}',
      'error.modelRequired': '请选择审查模型。',
      'error.provider': '模型提供方加载失败：{message}',
      'error.efforts': '思考强度加载失败：{message}',
      'common.loading': '加载中…',
      'common.loadFailed': '加载失败',
    }

    var enDict = {
      'chip.label': 'Review settings',
      'chip.sessionModel': 'Session model',
      'chip.title': 'Auto review: {model} · {policy}',
      'short.ask': 'Confirm',
      'short.deny': 'Reject',
      'dialog.title': 'Auto review settings',
      'dialog.subtitle': 'These settings apply to this Session only. Save them as a preset to reuse them elsewhere.',
      'dialog.close': 'Close',
      'dialog.cancel': 'Cancel',
      'dialog.save': 'Save',
      'dialog.saving': 'Saving…',
      'dialog.loading': 'Loading…',
      'dialog.retry': 'Retry',
      'dialog.reset': 'Reset to default',
      'dialog.inactive': 'Auto review is not active in this Session. These settings take effect the next time it is enabled.',
      'section.model': 'Reviewer model',
      'section.model.desc': 'Follow the Session model by default, or pick a dedicated reviewer model.',
      'section.policy': 'When a call does not pass',
      'section.policy.desc': 'What happens when the reviewer denies the call or the review itself fails.',
      'section.preset': 'Presets',
      'section.preset.desc': 'Presets are stored locally. Applying one still leaves the Session free to fine-tune it.',
      'source.follow': 'Follow the Session model',
      'source.follow.desc': 'Review with the provider and model the Session is using.',
      'source.custom': 'Choose a model',
      'source.custom.desc': 'Pick a dedicated provider and model for review.',
      'route.follow': 'Session model: {model}',
      'route.unknown': 'The Session has no model yet. Send a message to choose a reasoning effort.',
      'provider.label': 'Provider',
      'provider.placeholder': 'Choose a provider',
      'model.label': 'Model',
      'model.placeholder': 'Choose a model',
      'model.loading': 'Loading models…',
      'model.loadFailed': 'Could not load models',
      'effort.label': 'Reasoning effort',
      'effort.default': 'Default (model setting)',
      'effort.loading': 'Loading reasoning efforts…',
      'effort.unsupported': '{effort} (not declared by this model)',
      'effort.hint': 'Sent only when the reviewer model declares it; otherwise the model default is used.',
      'policy.ask.title': 'Ask me to confirm',
      'policy.ask.desc': 'Pause this call when the reviewer denies it and let me decide whether to run it.',
      'policy.deny.title': 'Reject and return the review',
      'policy.deny.desc': 'Block the call immediately and return the review result to the requester without asking me.',
      'policy.neverNote': 'This Session uses the “never ask” approval policy, so “ask me” will still end as a rejection.',
      'preset.placeholder': 'No preset',
      'preset.choose': 'Choose a preset',
      'preset.builtin': 'Built-in',
      'preset.dirty': 'These settings differ from the preset. Update it or save them as a new preset.',
      'preset.saveAs': 'Save as preset',
      'preset.update': 'Update this preset',
      'preset.delete': 'Delete this preset',
      'preset.name': 'Preset name',
      'preset.description': 'Description',
      'preset.namePlaceholder': 'For example: Quick review',
      'preset.descriptionPlaceholder': 'Description (optional)',
      'preset.save': 'Save preset',
      'preset.saving': 'Saving…',
      'preset.cancel': 'Cancel',
      'preset.confirmDelete': 'Delete the preset “{name}”?',
      'preset.nameRequired': 'Enter a preset name.',
      'preset.builtin.followAsk.name': 'Follow session model · confirm',
      'preset.builtin.followAsk.description': 'Review with the Session model; ask me when a call is denied.',
      'preset.builtin.followDeny.name': 'Follow session model · reject',
      'preset.builtin.followDeny.description': 'Review with the Session model; reject immediately and return the result.',
      'error.load': 'Could not load settings: {message}',
      'error.save': 'Could not save: {message}',
      'error.preset': 'Preset operation failed: {message}',
      'error.modelRequired': 'Choose a reviewer model.',
      'error.provider': 'Could not load providers: {message}',
      'error.efforts': 'Could not load reasoning efforts: {message}',
      'common.loading': 'Loading…',
      'common.loadFailed': 'Load failed',
    }

    // ------------------------------------------------------------ store
    var listeners = new Set()
    var state = {
      open: false,
      sessionId: null,
      status: null,
      loading: false,
      error: null,
      draft: null,
      presetId: null,
      presetDirty: false,
      providers: null,
      providersError: null,
      providersLoading: false,
      models: {},
      efforts: {},
      saving: false,
      presetForm: false,
      presetName: '',
      presetDescription: '',
      presetSaving: false,
      presetError: null,
      presetDeleteConfirm: false,
      chip: { sessionId: null, value: null, loading: false, error: null },
    }

    function patch(next) {
      state = Object.assign({}, state, next)
      listeners.forEach(function (listener) { listener() })
    }

    function subscribe(listener) {
      listeners.add(listener)
      return function () { listeners.delete(listener) }
    }

    function getSnapshot() { return state }
    function useStore() { return React.useSyncExternalStore(subscribe, getSnapshot) }

    function clone(value) {
      return value === undefined || value === null ? value : JSON.parse(JSON.stringify(value))
    }

    function normalizeDraft(input) {
      var config = input !== null && typeof input === 'object' ? input : {}
      var reviewer = config.reviewer !== null && typeof config.reviewer === 'object' ? config.reviewer : {}
      var provider = typeof reviewer.provider === 'string' && reviewer.provider !== '' ? reviewer.provider : null
      var model = typeof reviewer.model === 'string' && reviewer.model !== '' ? reviewer.model : null
      if ((provider === null) !== (model === null)) {
        provider = null
        model = null
      }
      return {
        reviewer: {
          provider: provider,
          model: model,
          reasoningEffort: typeof reviewer.reasoningEffort === 'string' && reviewer.reasoningEffort !== ''
            ? reviewer.reasoningEffort : null,
        },
        onDenied: config.onDenied === 'deny' ? 'deny' : 'ask',
      }
    }

    function presetLabel(preset, tr) {
      return preset.nameKey ? tr(preset.nameKey) : preset.name
    }

    function presetDescription(preset, tr) {
      return preset.descriptionKey ? tr(preset.descriptionKey) : (preset.description || '')
    }

    function findPreset(store, presetId) {
      var presets = store.status && Array.isArray(store.status.presets) ? store.status.presets : []
      return findPresetIn(presets, presetId)
    }

    function findPresetIn(presets, presetId) {
      if (presetId === null || presetId === undefined) return null
      for (var i = 0; i < presets.length; i += 1) {
        if (presets[i].id === presetId) return presets[i]
      }
      return null
    }

    function sameConfig(left, right) {
      return JSON.stringify(normalizeDraft(left)) === JSON.stringify(normalizeDraft(right))
    }

    function withStatusPresets(store, presets) {
      if (!store.status) return store.status
      return Object.assign({}, store.status, { presets: presets })
    }

    function policyShort(config, tr) {
      return config && config.onDenied === 'deny' ? tr('short.deny') : tr('short.ask')
    }

    function routeShortLabel(status, tr) {
      if (status.config && status.config.reviewer && status.config.reviewer.model) {
        return status.config.reviewer.model
      }
      if (status.sessionRoute && status.sessionRoute.model) return status.sessionRoute.model
      return tr('chip.sessionModel')
    }

    // ----------------------------------------------------------- plugin
    var name = 'dsh-better-approve'
    var inject = ['slots', 'connection', 'locale']

    var STYLE_ID = 'dsh-better-approve-style'
    var CSS = [
      '.dba-chip{display:inline-flex;align-items:center;gap:6px;max-width:230px;height:28px;padding:0 8px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}',
      '.dba-chip:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary)}',
      '.dba-chip-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;width:14px;height:14px;color:var(--dsw-alias-brand-primary)}',
      '.dba-chip-label{overflow:hidden;text-overflow:ellipsis;max-width:150px}',
      '.dba-chip-sep{color:var(--dsw-alias-label-secondary);opacity:.7}',
      '.dba-chip-policy{color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.dba-root{pointer-events:auto;position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px}',
      '.dba-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.34));backdrop-filter:blur(4px)}',
      '.dba-dialog{position:relative;z-index:1;display:flex;flex-direction:column;width:min(560px,100%);max-height:calc(100dvh - 48px);overflow:hidden;border:0;border-radius:12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);box-shadow:0 16px 48px rgba(0,0,0,.24);outline:none}',
      '.dba-dialog *{box-sizing:border-box}',
      '.dba-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 16px 10px 24px}',
      '.dba-title{margin:0;font-size:16px;line-height:24px;font-weight:500}',
      '.dba-subtitle{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dba-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:16px;line-height:1}',
      '.dba-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary)}',
      '.dba-body{display:flex;flex-direction:column;gap:20px;padding:8px 24px 4px;overflow-y:auto;overscroll-behavior:contain;min-height:80px}',
      '.dba-section{display:flex;flex-direction:column;gap:8px}',
      '.dba-section-title{font-size:14px;line-height:20px;font-weight:500}',
      '.dba-section-desc{margin:-2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dba-section-body{display:flex;flex-direction:column;gap:10px}',
      '.dba-choice-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '@media (max-width:480px){.dba-choice-row{grid-template-columns:1fr}}',
      '.dba-option{display:flex;align-items:flex-start;gap:8px;width:100%;padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer}',
      '.dba-option:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dba-option-selected{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary) inset}',
      '.dba-option-dot{flex:none;width:14px;height:14px;margin-top:2px;border:1.5px solid var(--dsw-alias-border-l2);border-radius:50%;background:transparent}',
      '.dba-option-selected .dba-option-dot{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px var(--dsw-alias-brand-primary) inset}',
      '.dba-option-text{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.dba-option-title{font-size:13px;line-height:18px;font-weight:500}',
      '.dba-option-desc{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dba-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '@media (max-width:480px){.dba-fields{grid-template-columns:1fr}}',
      '.dba-field{display:flex;flex-direction:column;gap:5px;min-width:0;position:relative}',
      '.dba-field-label{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dba-select,.dba-input{width:100%;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}',
      '.dba-select:hover,.dba-input:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dba-select:disabled{opacity:.6;cursor:default}',
      '.dba-input::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.dba-picker-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;text-align:left;cursor:pointer}',
      '.dba-picker-trigger:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dba-picker-trigger:disabled{opacity:.6;cursor:default}',
      '.dba-picker-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dba-picker-chevron{flex:none;font-size:10px;color:var(--dsw-alias-label-secondary);transition:transform .12s}',
      '.dba-picker-open .dba-picker-chevron{transform:rotate(180deg)}',
      '.dba-picker-menu{display:flex;flex-direction:column;gap:1px;max-height:220px;overflow-y:auto;padding:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-overlay);box-shadow:0 8px 24px rgba(0,0,0,.18)}',
      '.dba-picker-option{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;text-align:left;cursor:pointer}',
      '.dba-picker-option:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
      '.dba-picker-option-selected{color:var(--dsw-alias-brand-primary)}',
      '.dba-picker-option-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dba-picker-check{flex:none;font-size:12px}',
      '.dba-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dba-hint-error{color:var(--dsw-alias-state-error-primary)}',
      '.dba-note{padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dba-note-warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}',
      '.dba-preset-row{display:flex;align-items:flex-start;gap:8px}',
      '.dba-preset-row .dba-field{flex:1 1 auto}',
      '.dba-badge{flex:none;display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.dba-buttons{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dba-btn{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}',
      '.dba-btn:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}',
      '.dba-btn:disabled{opacity:.55;cursor:default}',
      '.dba-btn-primary{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:#fff}',
      '.dba-btn-primary:hover{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);opacity:.92}',
      '.dba-btn-danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.dba-btn-ghost{border-color:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dba-footer{display:flex;align-items:center;gap:8px;padding:16px 24px 20px}',
      '.dba-footer-spacer{flex:1 1 auto}',
      '.dba-error{margin:0;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;white-space:pre-wrap}',
      '.dba-loading{display:flex;align-items:center;justify-content:center;min-height:120px;color:var(--dsw-alias-label-secondary);font-size:13px}',
      '.dba-preset-form{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px dashed var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
      '.dba-dialog :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
    ].join('\n')

    function ShieldIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M8 1.6 13 3.4v3.7c0 3.1-2 5.8-5 7.3-3-1.5-5-4.2-5-7.3V3.4L8 1.6Z',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'm5.5 8 1.7 1.7L10.7 6',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    function apply(ctx) {
      var slots = ctx.slots
      var connection = ctx.connection
      var locale = ctx.locale

      ctx.effect(function () {
        return locale.register(NS, { zh: zhDict, en: enDict })
      }, name + ': dictionaries')

      var t = locale.bind(NS)

      ctx.effect(function () {
        if (typeof document === 'undefined' || document.getElementById(STYLE_ID) !== null) return function () {}
        var style = document.createElement('style')
        style.id = STYLE_ID
        style.textContent = CSS
        document.head.appendChild(style)
        return function () {
          if (style.parentNode !== null) style.parentNode.removeChild(style)
        }
      }, name + ': stylesheet')

      function remoteCall(endpoint, args) {
        if (!connection || !connection.rpc || typeof connection.rpc.call !== 'function') {
          return Promise.reject(new Error('better-approve: the shared RPC channel is unavailable'))
        }
        return connection.rpc.call('/api', endpoint, { args: args || {} }).then(function (envelope) {
          if (!envelope || envelope.ok !== true) {
            var message = envelope && envelope.error !== undefined
              ? String(envelope.error.message !== undefined ? envelope.error.message : envelope.error)
              : 'remote call failed'
            throw new Error(message.replace(/^better-approve:\s*/, ''))
          }
          return envelope.value
        })
      }

      // ------------------------------------------------------- data loads
      function ensureProviders() {
        if (state.providers !== null || state.providersLoading) return
        patch({ providersLoading: true, providersError: null })
        remoteCall('betterApprove/providers', {}).then(function (providers) {
          patch({ providersLoading: false, providers: Array.isArray(providers) ? providers : [] })
        }).catch(function (error) {
          patch({ providersLoading: false, providersError: String(error && error.message ? error.message : error) })
        })
      }

      function ensureModels(provider) {
        if (!provider) return
        var existing = state.models[provider]
        if (existing && (existing.loading || existing.value)) return
        var models = Object.assign({}, state.models)
        models[provider] = { loading: true, value: null, error: null }
        patch({ models: models })
        remoteCall('betterApprove/models', { provider: provider }).then(function (value) {
          var next = Object.assign({}, state.models)
          next[provider] = { loading: false, value: Array.isArray(value) ? value : [], error: null }
          patch({ models: next })
        }).catch(function (error) {
          var next = Object.assign({}, state.models)
          next[provider] = { loading: false, value: [], error: String(error && error.message ? error.message : error) }
          patch({ models: next })
        })
      }

      function ensureEfforts(provider, model) {
        if (!provider || !model) return
        var key = provider + '/' + model
        var existing = state.efforts[key]
        if (existing && (existing.loading || existing.value)) return
        var efforts = Object.assign({}, state.efforts)
        efforts[key] = { loading: true, value: null, error: null }
        patch({ efforts: efforts })
        remoteCall('betterApprove/efforts', { provider: provider, model: model }).then(function (value) {
          var next = Object.assign({}, state.efforts)
          next[key] = {
            loading: false,
            value: value || { efforts: [], defaultEffort: null },
            error: value && value.error ? value.error : null,
          }
          patch({ efforts: next })
        }).catch(function (error) {
          var next = Object.assign({}, state.efforts)
          next[key] = { loading: false, value: { efforts: [], defaultEffort: null }, error: String(error && error.message ? error.message : error) }
          patch({ efforts: next })
        })
      }

      function effectiveRoute(store, draft) {
        var config = draft || store.draft
        if (config && config.reviewer.provider && config.reviewer.model) {
          return { provider: config.reviewer.provider, model: config.reviewer.model }
        }
        var route = store.status && store.status.sessionRoute
        if (route && route.provider && route.model) return { provider: route.provider, model: route.model }
        return null
      }

      function warmRoute(store, draft) {
        var route = effectiveRoute(store, draft)
        ensureProviders()
        if (route) {
          ensureModels(route.provider)
          ensureEfforts(route.provider, route.model)
        }
      }

      function loadStatus(sessionId) {
        patch({ loading: true, error: null, status: null, draft: null, presetId: null, presetDirty: false, presetForm: false, presetError: null, presetDeleteConfirm: false })
        remoteCall('betterApprove/status', { sessionId: sessionId }).then(function (status) {
          if (state.sessionId !== sessionId) return
          var draft = normalizeDraft(status.config)
          var source = findPresetIn(Array.isArray(status.presets) ? status.presets : [], status.presetId)
          patch({
            loading: false,
            status: status,
            draft: draft,
            presetId: status.presetId,
            presetDirty: source !== null && !sameConfig(draft, source.config),
            chip: { sessionId: String(status.sessionId), value: status, loading: false, error: null },
          })
          warmRoute(state, state.draft)
        }).catch(function (error) {
          if (state.sessionId !== sessionId) return
          patch({ loading: false, error: String(error && error.message ? error.message : error) })
        })
      }

      function loadChipStatus(sessionId, force) {
        var chip = state.chip
        if (!force && chip.sessionId === sessionId && (chip.loading || chip.value !== null)) return
        patch({ chip: { sessionId: sessionId, value: chip.sessionId === sessionId ? chip.value : null, loading: true, error: null } })
        remoteCall('betterApprove/status', { sessionId: sessionId }).then(function (status) {
          if (state.chip.sessionId !== sessionId) return
          patch({ chip: { sessionId: sessionId, value: status, loading: false, error: null } })
        }).catch(function (error) {
          if (state.chip.sessionId !== sessionId) return
          patch({ chip: { sessionId: sessionId, value: null, loading: false, error: String(error && error.message ? error.message : error) } })
        })
      }

      function openSettings(sessionId) {
        patch({
          open: true,
          sessionId: sessionId,
          error: null,
          presetForm: false,
          presetError: null,
        })
        loadStatus(sessionId)
      }

      function closeSettings() {
        patch({ open: false, saving: false, presetForm: false, presetDeleteConfirm: false, presetError: null })
      }

      function setDraft(nextDraft, presetId) {
        patch({ draft: nextDraft, presetId: presetId === undefined ? null : presetId })
      }

      function editDraft(mutate) {
        if (!state.draft) return
        var draft = clone(state.draft)
        mutate(draft)
        patch({ draft: draft, presetDirty: true })
      }

      // ------------------------------------------------------- operations
      function saveSession() {
        if (!state.draft || state.saving) return
        if (state.draft.reviewer.provider && !state.draft.reviewer.model) {
          patch({ error: t('error.modelRequired') })
          return
        }
        patch({ saving: true, error: null })
        remoteCall('betterApprove/save', {
          sessionId: state.sessionId,
          config: state.draft,
          presetId: state.presetId,
        }).then(function (status) {
          var chipSession = state.chip.sessionId
          var draft = normalizeDraft(status.config)
          var source = findPresetIn(Array.isArray(status.presets) ? status.presets : [], status.presetId)
          patch({
            saving: false,
            open: false,
            status: status,
            draft: draft,
            presetId: status.presetId,
            presetDirty: source !== null && !sameConfig(draft, source.config),
            chip: chipSession === String(status.sessionId)
              ? { sessionId: chipSession, value: status, loading: false, error: null }
              : state.chip,
          })
        }).catch(function (error) {
          patch({ saving: false, error: t('error.save', { message: String(error && error.message ? error.message : error) }) })
        })
      }

      function resetSession() {
        if (!state.sessionId || state.saving) return
        patch({ saving: true, error: null })
        remoteCall('betterApprove/reset', { sessionId: state.sessionId }).then(function (status) {
          var chipSession = state.chip.sessionId
          patch({
            saving: false,
            status: status,
            draft: normalizeDraft(status.config),
            presetId: null,
            presetDirty: false,
            chip: chipSession === String(status.sessionId)
              ? { sessionId: chipSession, value: status, loading: false, error: null }
              : state.chip,
          })
        }).catch(function (error) {
          patch({ saving: false, error: t('error.save', { message: String(error && error.message ? error.message : error) }) })
        })
      }

      function applyPreset(presetId) {
        if (!presetId) {
          patch({ presetId: null, presetDirty: false })
          return
        }
        var preset = findPreset(state, presetId)
        if (preset === null) return
        var draft = normalizeDraft(preset.config)
        patch({ draft: draft, presetId: preset.id, presetDirty: false, presetForm: false, presetError: null, presetDeleteConfirm: false })
        warmRoute(state, draft)
      }

      function savePresetForm() {
        if (state.presetSaving || !state.draft) return
        var name = state.presetName.trim()
        if (name === '') {
          patch({ presetError: t('preset.nameRequired') })
          return
        }
        patch({ presetSaving: true, presetError: null })
        remoteCall('betterApprove/savePreset', {
          preset: {
            name: name,
            description: state.presetDescription.trim(),
            config: state.draft,
          },
        }).then(function (result) {
          patch({
            presetSaving: false,
            presetForm: false,
            presetName: '',
            presetDescription: '',
            presetId: result.preset.id,
            presetDirty: false,
            status: withStatusPresets(state, result.presets),
          })
        }).catch(function (error) {
          patch({ presetSaving: false, presetError: t('error.preset', { message: String(error && error.message ? error.message : error) }) })
        })
      }

      function updateCurrentPreset() {
        if (state.presetSaving || !state.draft) return
        var preset = findPreset(state, state.presetId)
        if (preset === null || preset.builtIn) return
        patch({ presetSaving: true, presetError: null })
        remoteCall('betterApprove/savePreset', {
          preset: {
            id: preset.id,
            name: preset.name,
            description: preset.description,
            config: state.draft,
          },
        }).then(function (result) {
          patch({
            presetSaving: false,
            presetId: result.preset.id,
            presetDirty: false,
            status: withStatusPresets(state, result.presets),
          })
        }).catch(function (error) {
          patch({ presetSaving: false, presetError: t('error.preset', { message: String(error && error.message ? error.message : error) }) })
        })
      }

      function deleteCurrentPreset() {
        var preset = findPreset(state, state.presetId)
        if (preset === null || preset.builtIn) return
        patch({ presetDeleteConfirm: true, presetForm: false, presetError: null })
      }

      function confirmDeletePreset() {
        var preset = findPreset(state, state.presetId)
        if (preset === null || preset.builtIn) return
        patch({ presetSaving: true, presetError: null })
        remoteCall('betterApprove/deletePreset', { presetId: preset.id }).then(function (result) {
          patch({
            presetSaving: false,
            presetId: null,
            presetDirty: false,
            presetDeleteConfirm: false,
            status: withStatusPresets(state, result.presets),
          })
        }).catch(function (error) {
          patch({ presetSaving: false, presetDeleteConfirm: false, presetError: t('error.preset', { message: String(error && error.message ? error.message : error) }) })
        })
      }

      // -------------------------------------------------------- components
      function ReviewChip(props) {
        var tr = typeof props.t === 'function' ? props.t : t
        var store = useStore()
        var permissions = typeof props.useProjection === 'function' ? props.useProjection('permissions') : undefined
        var active = permissions !== undefined && permissions !== null && permissions.currentValue === 'auto'
        var sessionId = props.sessionId === undefined || props.sessionId === null ? null : String(props.sessionId)

        React.useEffect(function () {
          if (active && sessionId !== null) loadChipStatus(sessionId, true)
        }, [active, sessionId])

        if (!active || sessionId === null) return null
        var chip = store.chip
        var value = chip && chip.sessionId === sessionId ? chip.value : null
        var label = value ? routeShortLabel(value, tr) : tr('chip.label')
        var policy = value ? policyShort(value.config, tr) : ''
        var title = value
          ? tr('chip.title', { model: label, policy: policy })
          : tr('chip.label')
        return h('button', {
          type: 'button',
          className: 'dba-chip',
          title: title,
          onClick: function () { openSettings(sessionId) },
        },
          h('span', { className: 'dba-chip-icon' }, h(ShieldIcon)),
          h('span', { className: 'dba-chip-label' }, label),
          policy === '' ? null : h('span', { className: 'dba-chip-sep', 'aria-hidden': 'true' }, '·'),
          policy === '' ? null : h('span', { className: 'dba-chip-policy' }, policy),
        )
      }

      function OptionCard(props) {
        return h('button', {
          type: 'button',
          role: 'radio',
          'aria-checked': props.selected ? 'true' : 'false',
          className: 'dba-option' + (props.selected ? ' dba-option-selected' : ''),
          onClick: props.onSelect,
        },
          h('span', { className: 'dba-option-dot', 'aria-hidden': 'true' }),
          h('span', { className: 'dba-option-text' },
            h('span', { className: 'dba-option-title' }, props.title),
            props.description === undefined ? null : h('span', { className: 'dba-option-desc' }, props.description),
          ),
        )
      }

      function Picker(props) {
        var openState = React.useState(false)
        var open = openState[0]
        var setOpen = openState[1]
        var rootRef = React.useRef(null)
        var options = Array.isArray(props.options) ? props.options : []
        var value = props.value === null || props.value === undefined ? '' : String(props.value)
        var current = null
        for (var index = 0; index < options.length; index += 1) {
          if (String(options[index].id) === value) current = options[index]
        }
        React.useEffect(function () {
          if (!open) return function () {}
          function onPointerDown(event) {
            if (rootRef.current !== null && rootRef.current.contains(event.target)) return
            setOpen(false)
          }
          document.addEventListener('mousedown', onPointerDown)
          return function () { document.removeEventListener('mousedown', onPointerDown) }
        }, [open])
        return h('div', { className: 'dba-field', ref: rootRef },
          h('span', { className: 'dba-field-label' }, props.label),
          h('button', {
            type: 'button',
            className: 'dba-picker-trigger' + (open ? ' dba-picker-open' : ''),
            disabled: props.disabled === true,
            'aria-haspopup': 'listbox',
            'aria-expanded': open ? 'true' : 'false',
            onClick: function () { setOpen(!open) },
          },
            h('span', { className: 'dba-picker-value' }, current === null ? (props.placeholder || '') : current.name),
            h('span', { className: 'dba-picker-chevron', 'aria-hidden': 'true' }, '▾'),
          ),
          open
            ? h('div', { className: 'dba-picker-menu', role: 'listbox' }, options.map(function (option) {
              var selected = current !== null && option.id === current.id
              return h('button', {
                key: String(option.id),
                type: 'button',
                role: 'option',
                'aria-selected': selected ? 'true' : 'false',
                className: 'dba-picker-option' + (selected ? ' dba-picker-option-selected' : ''),
                onClick: function () { setOpen(false); props.onChange(option.id) },
              },
                h('span', { className: 'dba-picker-option-name' }, option.name),
                selected ? h('span', { className: 'dba-picker-check', 'aria-hidden': 'true' }, '✓') : null,
              )
            }))
            : null,
          props.hint === undefined ? null : h('span', { className: 'dba-hint' + (props.error ? ' dba-hint-error' : '') }, props.hint),
        )
      }

      function TextField(props) {
        return h('label', { className: 'dba-field' },
          h('span', { className: 'dba-field-label' }, props.label),
          h('input', {
            className: 'dba-input',
            type: 'text',
            value: props.value,
            placeholder: props.placeholder,
            disabled: props.disabled === true,
            maxLength: props.maxLength,
            onChange: function (event) { props.onChange(event.target.value) },
          }),
        )
      }

      function Section(props) {
        var children = Array.isArray(props.children) ? props.children : [props.children]
        return h('section', { className: 'dba-section' },
          h('div', { className: 'dba-section-title' }, props.title),
          props.description === undefined ? null : h('div', { className: 'dba-section-desc' }, props.description),
          h.apply(null, ['div', { className: 'dba-section-body' }].concat(children)),
        )
      }

      function providerOptions(tr, store) {
        var options = [{ id: '', name: tr('provider.placeholder') }]
        var providers = Array.isArray(store.providers) ? store.providers : []
        providers.forEach(function (provider) {
          options.push({ id: provider.id, name: provider.name || provider.id })
        })
        return options
      }

      function modelOptions(tr, store, provider) {
        if (!provider) return [{ id: '', name: tr('model.placeholder') }]
        var entry = store.models[provider]
        if (entry === undefined || entry.loading) return [{ id: '', name: tr('model.loading') }]
        if (entry.error) return [{ id: '', name: tr('model.loadFailed') }]
        var options = [{ id: '', name: tr('model.placeholder') }]
        ;(entry.value || []).forEach(function (model) {
          options.push({ id: model.id, name: model.name || model.id })
        })
        return options
      }

      function effortOptions(tr, store, config) {
        var options = [{ id: '', name: tr('effort.default') }]
        var route = effectiveRoute(store, config)
        if (!route) return options
        var entry = store.efforts[route.provider + '/' + route.model]
        if (entry && entry.value && Array.isArray(entry.value.efforts)) {
          entry.value.efforts.forEach(function (effort) {
            options.push({ id: effort.id, name: effort.name || effort.id })
          })
        }
        var current = config.reviewer.reasoningEffort
        var present = options.some(function (option) { return option.id === current })
        if (current !== null && current !== undefined && current !== '' && !present) {
          options.push({ id: current, name: tr('effort.unsupported', { effort: current }) })
        }
        return options
      }

      function effortHint(tr, store, config) {
        var route = effectiveRoute(store, config)
        if (!route) return tr('effort.hint')
        var entry = store.efforts[route.provider + '/' + route.model]
        if (entry && entry.loading) return tr('effort.loading')
        if (entry && entry.error) return tr('error.efforts', { message: entry.error })
        return tr('effort.hint')
      }

      function renderModelSection(tr, store) {
        var draft = store.draft
        var follow = !draft.reviewer.provider && !draft.reviewer.model
        var route = effectiveRoute(store, draft)
        var sessionRoute = store.status && store.status.sessionRoute
        var providerEntry = Array.isArray(store.providers) ? store.providers : null
        var providersHint = store.providersError
          ? tr('error.provider', { message: store.providersError })
          : (store.providersLoading || providerEntry === null ? tr('common.loading') : undefined)
        var fields = follow
          ? h('div', { className: 'dba-note' }, sessionRoute && sessionRoute.model
            ? tr('route.follow', { model: sessionRoute.model })
            : tr('route.unknown'))
          : h('div', { className: 'dba-fields' },
            h(Picker, {
              label: tr('provider.label'),
              placeholder: tr('provider.placeholder'),
              value: draft.reviewer.provider,
              options: providerOptions(tr, store),
              hint: providersHint,
              onChange: function (value) {
                editDraft(function (next) {
                  next.reviewer.provider = value || null
                  next.reviewer.model = null
                  next.reviewer.reasoningEffort = null
                })
                if (value) ensureModels(value)
              },
            }),
            h(Picker, {
              label: tr('model.label'),
              placeholder: tr('model.placeholder'),
              value: draft.reviewer.model,
              options: modelOptions(tr, store, draft.reviewer.provider),
              disabled: !draft.reviewer.provider,
              hint: !draft.reviewer.provider
                ? undefined
                : store.models[draft.reviewer.provider] && store.models[draft.reviewer.provider].loading
                  ? tr('model.loading')
                  : store.models[draft.reviewer.provider] && store.models[draft.reviewer.provider].error
                    ? tr('model.loadFailed')
                    : undefined,
              error: !!(draft.reviewer.provider && store.models[draft.reviewer.provider] && store.models[draft.reviewer.provider].error),
              onChange: function (value) {
                editDraft(function (next) {
                  next.reviewer.model = value || null
                  next.reviewer.reasoningEffort = null
                })
                if (draft.reviewer.provider && value) ensureEfforts(draft.reviewer.provider, value)
              },
            }),
          )
        return Section({
          title: tr('section.model'),
          description: tr('section.model.desc'),
          children: [
            h('div', { className: 'dba-choice-row', role: 'radiogroup', 'aria-label': tr('section.model') },
              h(OptionCard, {
                selected: follow,
                title: tr('source.follow'),
                description: tr('source.follow.desc'),
                onSelect: function () {
                  editDraft(function (next) {
                    next.reviewer.provider = null
                    next.reviewer.model = null
                    next.reviewer.reasoningEffort = null
                  })
                  if (store.status && store.status.sessionRoute && store.status.sessionRoute.provider) {
                    ensureEfforts(store.status.sessionRoute.provider, store.status.sessionRoute.model)
                  }
                },
              }),
              h(OptionCard, {
                selected: !follow,
                title: tr('source.custom'),
                description: tr('source.custom.desc'),
                onSelect: function () {
                  if (!follow) return
                  var initial = store.status && store.status.sessionRoute
                  editDraft(function (next) {
                    next.reviewer.provider = initial && initial.provider ? initial.provider : null
                    next.reviewer.model = initial && initial.model ? initial.model : null
                    next.reviewer.reasoningEffort = null
                  })
                  if (initial && initial.provider) {
                    ensureModels(initial.provider)
                    ensureEfforts(initial.provider, initial.model)
                  }
                },
              }),
            ),
            fields,
            h(Picker, {
              label: tr('effort.label'),
              value: draft.reviewer.reasoningEffort,
              options: effortOptions(tr, store, draft),
              disabled: route === null,
              hint: effortHint(tr, store, draft),
              onChange: function (value) {
                editDraft(function (next) { next.reviewer.reasoningEffort = value || null })
              },
            }),
          ],
        })
      }

      function renderPolicySection(tr, store) {
        var draft = store.draft
        var approval = store.status && store.status.approvalPolicy
        var note = approval === 'never' && draft.onDenied === 'ask'
          ? h('div', { className: 'dba-note dba-note-warn' }, tr('policy.neverNote'))
          : null
        return Section({
          title: tr('section.policy'),
          description: tr('section.policy.desc'),
          children: [
            h('div', { className: 'dba-choice-row', role: 'radiogroup', 'aria-label': tr('section.policy') },
              h(OptionCard, {
                selected: draft.onDenied !== 'deny',
                title: tr('policy.ask.title'),
                description: tr('policy.ask.desc'),
                onSelect: function () {
                  editDraft(function (next) { next.onDenied = 'ask' })
                },
              }),
              h(OptionCard, {
                selected: draft.onDenied === 'deny',
                title: tr('policy.deny.title'),
                description: tr('policy.deny.desc'),
                onSelect: function () {
                  editDraft(function (next) { next.onDenied = 'deny' })
                },
              }),
            ),
            note,
          ],
        })
      }

      function renderPresetSection(tr, store) {
        var presets = store.status && Array.isArray(store.status.presets) ? store.status.presets : []
        var options = [{ id: '', name: tr('preset.placeholder') }]
        presets.forEach(function (preset) {
          options.push({ id: preset.id, name: presetLabel(preset, tr) })
        })
        var current = findPreset(store, store.presetId)
        var children = [
          h('div', { className: 'dba-preset-row' },
            h(Picker, {
              label: tr('preset.choose'),
              value: store.presetId === null ? '' : store.presetId,
              options: options,
              onChange: applyPreset,
            }),
            current !== null && current.builtIn
              ? h('span', { className: 'dba-badge' }, tr('preset.builtin'))
              : null,
          ),
          current !== null && presetDescription(current, tr) !== ''
            ? h('div', { className: 'dba-note' }, presetDescription(current, tr))
            : null,
          current !== null && store.presetDirty
            ? h('div', { className: 'dba-note dba-note-warn' }, tr('preset.dirty'))
            : null,
          store.presetError === null ? null : h('p', { className: 'dba-error' }, store.presetError),
          store.presetForm
            ? h('div', { className: 'dba-preset-form' },
              h(TextField, {
                label: tr('preset.name'),
                value: store.presetName,
                placeholder: tr('preset.namePlaceholder'),
                maxLength: 60,
                disabled: store.presetSaving,
                onChange: function (value) { patch({ presetName: value }) },
              }),
              h(TextField, {
                label: tr('preset.description'),
                value: store.presetDescription,
                placeholder: tr('preset.descriptionPlaceholder'),
                maxLength: 240,
                disabled: store.presetSaving,
                onChange: function (value) { patch({ presetDescription: value }) },
              }),
              h('div', { className: 'dba-buttons' },
                h('button', {
                  type: 'button',
                  className: 'dba-btn dba-btn-primary',
                  disabled: store.presetSaving,
                  onClick: savePresetForm,
                }, store.presetSaving ? tr('preset.saving') : tr('preset.save')),
                h('button', {
                  type: 'button',
                  className: 'dba-btn dba-btn-ghost',
                  disabled: store.presetSaving,
                  onClick: function () { patch({ presetForm: false, presetError: null }) },
                }, tr('preset.cancel')),
              ),
            )
            : store.presetDeleteConfirm && current !== null && !current.builtIn
              ? h('div', { className: 'dba-buttons' },
                h('span', { className: 'dba-hint' }, tr('preset.confirmDelete', { name: presetLabel(current, tr) })),
                h('button', {
                  type: 'button',
                  className: 'dba-btn dba-btn-danger',
                  disabled: store.presetSaving,
                  onClick: confirmDeletePreset,
                }, tr('preset.delete')),
                h('button', {
                  type: 'button',
                  className: 'dba-btn dba-btn-ghost',
                  disabled: store.presetSaving,
                  onClick: function () { patch({ presetDeleteConfirm: false }) },
                }, tr('preset.cancel')),
              )
              : h('div', { className: 'dba-buttons' },
                h('button', {
                  type: 'button',
                  className: 'dba-btn dba-btn-ghost',
                  disabled: store.presetSaving,
                  onClick: function () { patch({ presetForm: true, presetDeleteConfirm: false, presetError: null }) },
                }, tr('preset.saveAs')),
                current !== null && !current.builtIn && store.presetDirty
                  ? h('button', {
                    type: 'button',
                    className: 'dba-btn dba-btn-ghost',
                    disabled: store.presetSaving,
                    onClick: updateCurrentPreset,
                  }, tr('preset.update'))
                  : null,
                current !== null && !current.builtIn
                  ? h('button', {
                    type: 'button',
                    className: 'dba-btn dba-btn-danger',
                    disabled: store.presetSaving,
                    onClick: deleteCurrentPreset,
                  }, tr('preset.delete'))
                  : null,
              ),
        ]
        return Section({
          title: tr('section.preset'),
          description: tr('section.preset.desc'),
          children: children,
        })
      }

      function SettingsOverlay(props) {
        var tr = typeof props.t === 'function' ? props.t : t
        var store = useStore()
        var dialogRef = React.useRef(null)

        React.useEffect(function () {
          if (!store.open) return function () {}
          if (dialogRef.current !== null && typeof dialogRef.current.focus === 'function') {
            dialogRef.current.focus()
          }
          function onKeyDown(event) {
            if (event.key === 'Escape') closeSettings()
          }
          document.addEventListener('keydown', onKeyDown)
          return function () { document.removeEventListener('keydown', onKeyDown) }
        }, [store.open])

        if (!store.open || store.sessionId === null) return null
        if (typeof document === 'undefined') return null

        var body
        if (store.loading) {
          body = h('div', { className: 'dba-loading' }, tr('dialog.loading'))
        } else if (store.error !== null && store.draft === null) {
          body = h('div', { className: 'dba-section-body' },
            h('p', { className: 'dba-error' }, tr('error.load', { message: store.error })),
            h('div', { className: 'dba-buttons' },
              h('button', {
                type: 'button',
                className: 'dba-btn',
                onClick: function () { loadStatus(store.sessionId) },
              }, tr('dialog.retry')),
            ),
          )
        } else if (store.draft === null) {
          body = h('div', { className: 'dba-loading' }, tr('dialog.loading'))
        } else {
          body = [
            store.status && store.status.active === false
              ? h('div', { className: 'dba-note' }, tr('dialog.inactive'))
              : null,
            renderModelSection(tr, store),
            renderPolicySection(tr, store),
            renderPresetSection(tr, store),
            store.error === null ? null : h('p', { className: 'dba-error' }, store.error),
          ]
        }

        var footer = store.draft === null
          ? null
          : h('div', { className: 'dba-footer' },
            h('button', {
              type: 'button',
              className: 'dba-btn dba-btn-ghost',
              disabled: store.saving || store.loading,
              onClick: resetSession,
            }, tr('dialog.reset')),
            h('span', { className: 'dba-footer-spacer' }),
            h('button', {
              type: 'button',
              className: 'dba-btn',
              disabled: store.saving,
              onClick: closeSettings,
            }, tr('dialog.cancel')),
            h('button', {
              type: 'button',
              className: 'dba-btn dba-btn-primary',
              disabled: store.saving || store.loading,
              onClick: saveSession,
            }, store.saving ? tr('dialog.saving') : tr('dialog.save')),
          )

        var bodyChildren = Array.isArray(body) ? body : [body]
        var dialog = h('div', {
          ref: dialogRef,
          className: 'dba-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': tr('dialog.title'),
          tabIndex: -1,
        },
          h('div', { className: 'dba-header' },
            h('div', null,
              h('h2', { className: 'dba-title' }, tr('dialog.title')),
              h('p', { className: 'dba-subtitle' }, tr('dialog.subtitle')),
            ),
            h('button', {
              type: 'button',
              className: 'dba-close',
              'aria-label': tr('dialog.close'),
              onClick: closeSettings,
            }, '✕'),
          ),
          h.apply(null, ['div', { className: 'dba-body' }].concat(bodyChildren)),
          footer,
        )

        return ReactDOM.createPortal(
          h('div', { className: 'dba-root' },
            h('div', { className: 'dba-mask', 'aria-hidden': 'true', onClick: closeSettings }),
            dialog,
          ),
          document.body,
        )
      }

      // ------------------------------------------------------ registrations
      slots.inject('conversation.input.left', function () {
        return slots.register({
          name: 'conversation.input.left',
          id: 'better-approve',
          order: 30,
          label: function () { return t('chip.label') },
          locale: NS,
        }, function (props) { return h(ReviewChip, props) })
      })

      slots.inject('shell.overlay', function () {
        return slots.register({
          name: 'shell.overlay',
          id: 'better-approve',
          order: 120,
          locale: NS,
        }, function (props) { return h(SettingsOverlay, props) })
      })
    }

    var module = { exports: {} }
    var exports = module.exports
    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
