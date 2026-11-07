// dsh-zhipu-card 宿主侧
// 借鉴 dsh-whale-widget：ctx.on('session/event') 监听每步真实 usage，按模型归属累计 token 与金额；
// 借鉴 dsh-quota-panel：胶囊+卡片样式（见 lib/client.js）。
// 数据事实：智谱按量计费无公开余额/用量接口（2026-09 实测），「余额」= 手填总量 − 自动累计已用。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const BASE = '/dsh-zhipu-card'          // 路由前缀
const KEY_REF = 'ZAI_API_KEY'           // 凭证引用
const PROBE_URL = 'https://open.bigmodel.cn/api/paas/v4/models' // key 探活（不取余额）
const MATCH = /(^|\/|[-_])(glm|zai)/i   // 模型归属：glm-5.3-flash / zai-org/GLM-5.3 等

// 内置价目表（¥/百万 token，{in 输入, cache 缓存命中, out 输出}）。
// ponytail: 价格为占位值，设置面板里按模型覆盖；智谱实际价格以控制台为准。
const DEFAULT_PRICE = { in: 8, cache: 2, out: 28 } // 旗舰档兜底
const PRICES = {
  'glm-5.3-flash': { in: 0.8, cache: 0.23, out: 2.8 },
  'glm-5.3-flashx': { in: 2, cache: 0.57, out: 7 },
  'glm-5.3': { in: 8, cache: 2, out: 28 },
  'glm-5.2': { in: 8, cache: 2, out: 28 },
  'glm-5.1': { in: 8, cache: 2, out: 28 },      // ≥32K 档
  'glm-5-turbo': { in: 7, cache: 1.8, out: 26 }, // ≥32K 档
  'glm-5': { in: 6, cache: 1.5, out: 22 },       // ≥32K 档
  'glm-4.7': { in: 4, cache: 0.8, out: 16 },
  'glm-4.5-air': { in: 0.8, cache: 0.16, out: 6 },
  'glm-4.7-flash': { in: 0, cache: 0, out: 0 },
  'glm-4.5-flash': { in: 0, cache: 0, out: 0 },
}

function dshHome() {
  return process.env.DSH_HOME && process.env.DSH_HOME.trim()
    ? process.env.DSH_HOME.trim()
    : path.join(os.homedir(), '.dsh')
}
const STATE_FILE = path.join(dshHome(), '.dzcard.json')
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }

// —— 状态：设置 + 按天用量（天数桶，重置口径从天数推导）——
function defaults() {
  return {
    settings: { total: 0, unit: 'money', reset: 'monthly', prices: {}, offset: 0 }, // unit: money|tokens; offset=校准偏差
    days: {},   // 'YYYY-MM-DD' -> { tokens, cost }
  }
}
let state = defaults()
let saveTimer = null
let curSess = null // 当前会话累计：{ id, tokens, cache, input }，切换会话自动重置
let lastCtx = null // 最近一轮 assistant/message 的 token 总量（≈ 已占用的上下文），重启后由下轮刷新

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    if (parsed && typeof parsed === 'object') {
      state = Object.assign(defaults(), parsed)
      state.settings = Object.assign(defaults().settings, parsed.settings || {})
      state.days = parsed.days && typeof parsed.days === 'object' ? parsed.days : {}
    }
  } catch (err) {}
}
function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)) } catch (err) {}
}
function scheduleSave() {
  if (saveTimer) return
  saveTimer = setTimeout(() => { saveTimer = null; saveState() }, 5000)
}

function dayKey(ts) {
  const d = ts ? new Date(ts) : new Date()
  return d.toISOString().slice(0, 10) // UTC 天；本地时区差异对累计口径影响可忽略
}
function priceFor(model) {
  return (state.settings.prices && state.settings.prices[model]) || PRICES[model] || DEFAULT_PRICE
}
function usedIn(reset) {
  const today = dayKey()
  const month = today.slice(0, 7)
  let tokens = 0, cost = 0, cache = 0, input = 0
  for (const [day, rec] of Object.entries(state.days)) {
    if (reset === 'daily' && day !== today) continue
    if (reset === 'monthly' && !day.startsWith(month)) continue
    tokens += Number(rec.tokens) || 0
    cost += Number(rec.cost) || 0
    cache += Number(rec.cache) || 0
    input += Number(rec.input) || 0
  }
  return { tokens, cost, cache, input }
}

// key 探活：60s 缓存
let probeCache = { ts: 0, ok: false, hasKey: false }
async function probeKey(credentials) {
  const now = Date.now()
  if (now - probeCache.ts < 60000) return probeCache
  let hasKey = false, ok = false
  try {
    const cred = await credentials.resolve(KEY_REF)
    const key = cred && cred.value
    hasKey = !!key
    if (key) {
      const r = await fetch(PROBE_URL, { headers: { Authorization: 'Bearer ' + key } })
      ok = r.status === 200
    }
  } catch (err) {}
  probeCache = { ts: now, ok, hasKey }
  return probeCache
}

export default {
  name: 'zhipu-card',
  apply(root) {
    const disposers = []
    // 注入行尽早注册（不依赖任何服务）
    disposers.push(root.on('webserver/index-inject', (table) => {
      try {
        if (!Array.isArray(table)) return
        for (const row of table) {
          if (row && row.kind === 'script' && typeof row.text === 'string' && row.text.includes(BASE + '/widget.js')) return
        }
        table.push({
          kind: 'script', placement: 'body',
          text: '(function(){try{var d=document.body||document.head||document.documentElement;if(!d)return;' +
            'var s=document.createElement("script");s.src="' + BASE + '/widget.js";' +
            's.onerror=function(){};d.appendChild(s)}catch(e){}})()',
        })
      } catch (err) {}
    }))

    root.inject(['webServer', 'credentials'], (ctx) => {
      loadState()

      // —— 会话事件记账：assistant/message 携带每步真实 usage ——
      // 口径与鲸鱼挂件一致：input + cacheRead + output（reasoning 已含在 output 内，不重复加）。
      disposers.push(ctx.on('session/event', (session, event) => {
        try {
          if (!event || event.type !== 'assistant/message') return
          const d = event.data
          const u = d && d.usage
          if (!u || typeof u !== 'object') return
          const model = (d.message && d.message.source && d.message.source.model) || ''
          if (!MATCH.test(model)) return
          const inTok = Number(u.inputTokens) || 0
          const cacheTok = Number(u.cacheReadTokens) || 0
          const outTok = Number(u.outputTokens) || 0
          const toks = inTok + cacheTok + outTok
          if (toks <= 0) return
          const p = priceFor(model)
          const cost = (inTok / 1e6) * p.in + (cacheTok / 1e6) * p.cache + (outTok / 1e6) * p.out
          const day = dayKey()
          const rec = state.days[day] || (state.days[day] = { tokens: 0, cost: 0, cache: 0, input: 0 })
          rec.tokens += toks
          rec.cost += cost
          rec.cache += cacheTok
          rec.input += inTok
          lastCtx = { tokens: toks, model: model }
          const sid = session && (session.id || session.sessionId) || 'default'
          if (!curSess || curSess.id !== sid) curSess = { id: sid, tokens: 0, cache: 0, input: 0 }
          curSess.tokens += toks; curSess.cache += cacheTok; curSess.input += inTok
          scheduleSave()
        } catch (err) {}
      }))

      // —— 轻量安全栅栏：回环 Host + 同源校验（完整版见鲸鱼挂件 issue #92/#136）——
      function rejected(req, res) {
        const deny = (code) => { try { res.statusCode = code || 403; res.end() } catch (err) {} return true }
        const host = String(req.headers.host || '').split(':')[0]
        if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') return deny(403)
        if (String(req.headers['sec-fetch-site'] || '') === 'cross-site') return deny(403)
        const origin = req.headers.origin
        if (origin && !String(origin).includes(host)) return deny(403)
        return false
      }
      const register = (route) => {
        const inner = route.handler
        disposers.push(ctx.webServer.register(Object.assign({}, route, {
          handler: async (req, res) => { if (rejected(req, res)) return; return inner(req, res) },
        })))
      }

      // widget.js：按 mtime 热读，改前端无需重启
      let widgetCache = { mtime: 0, text: '' }
      function widgetJs() {
        const file = path.join(PLUGIN_ROOT, 'lib', 'client.js')
        try {
          const mtime = fs.statSync(file).mtimeMs
          if (mtime !== widgetCache.mtime) {
            widgetCache = { mtime, text: fs.readFileSync(file, 'utf8') }
          }
        } catch (err) { return '// client.js missing' }
        return widgetCache.text
      }

      register({
        kind: 'exact', path: BASE + '/widget.js',
        handler: (req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(widgetJs())
        },
      })

      register({
        kind: 'exact', path: BASE + '/summary.json',
        handler: async (req, res) => {
          const s = state.settings
          const used = usedIn(s.reset)
          const probe = await probeKey(ctx.credentials)
          const off = Number(s.offset) || 0
          const remaining = s.unit === 'money'
            ? (Number(s.total) || 0) - used.cost - off
            : (Number(s.total) || 0) - used.tokens - off
          res.writeHead(200, JSON_HEADERS)
          // 计费时段：智谱按量计费无峰谷（全天统一价；峰谷 5 折仅限 Coding Plan 积分体系）
          const tariffModel = (lastCtx && lastCtx.model) || 'glm-5.3-flash'
          res.end(JSON.stringify({
            ok: true, ver: 2, name: '智谱', keyRef: KEY_REF, hasKey: probe.hasKey, keyValid: probe.ok,
            total: Number(s.total) || 0, unit: s.unit, reset: s.reset, offset: Number(s.offset) || 0,
            used, remaining,
            tariff: { mode: 'flat', model: tariffModel, price: priceFor(tariffModel) },
            today: state.days[dayKey()] || { tokens: 0, cost: 0 },
            sess: curSess ? { tokens: curSess.tokens, cache: curSess.cache, input: curSess.input } : null,
            ctx: lastCtx ? {
              tokens: lastCtx.tokens, model: lastCtx.model,
              // 上下文窗口：glm-5 系 1M，glm-4.7 200K，其余 128K；设置里 ctxLimit 可覆盖
              limit: Number(state.settings.ctxLimit) ||
                (/glm-5/.test(lastCtx.model) ? 1000000 : /4\.7/.test(lastCtx.model) ? 200000 : 128000),
            } : null,
          }))
        },
      })

      register({
        kind: 'exact', path: BASE + '/settings.json',
        handler: async (req, res) => {
          if (req.method === 'POST') {
            let body = ''
            for await (const chunk of req) body += chunk
            try {
              const patch = JSON.parse(body || '{}')
              const s = state.settings
              if (patch.total !== undefined) s.total = Math.max(0, Number(patch.total) || 0)
              if (patch.unit === 'money' || patch.unit === 'tokens') s.unit = patch.unit
              if (['none', 'daily', 'monthly'].includes(patch.reset)) s.reset = patch.reset
              // 校准：填「实际余额」→ offset = 总量 − 已用 − 实际；也允许直接传 offset
              if (patch.actual !== undefined && Number.isFinite(Number(patch.actual))) {
                const u = usedIn(s.reset)
                const usedRef = s.unit === 'money' ? u.cost : u.tokens
                s.offset = (Number(s.total) || 0) - usedRef - Number(patch.actual)
              }
              if (patch.offset !== undefined && Number.isFinite(Number(patch.offset))) s.offset = Number(patch.offset)
              if (patch.ctxLimit !== undefined) s.ctxLimit = Math.max(0, Number(patch.ctxLimit) || 0)
              if (patch.prices && typeof patch.prices === 'object') {
                s.prices = {} // 整体覆盖，前端传全量
                for (const [m, p] of Object.entries(patch.prices)) {
                  const inP = Number(p && p.in), cacheP = Number(p && p.cache), outP = Number(p && p.out)
                  if (m && [inP, cacheP, outP].every(Number.isFinite) && inP >= 0 && cacheP >= 0 && outP >= 0) {
                    s.prices[m] = { in: inP, cache: cacheP, out: outP }
                  }
                }
              }
              saveState()
            } catch (err) {}
          }
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: true, settings: state.settings }))
        },
      })

      // web 注入（桌面端走上面的 index-inject 结构化行）
      disposers.push(ctx.webServer.tapIndex((html) => {
        if (html.includes(BASE + '/widget.js')) return html
        const tag = '<script defer src="' + BASE + '/widget.js"></script>'
        if (html.includes('</body>')) return html.replace('</body>', tag + '</body>')
        return html + tag
      }))
    })

    root.effect(() => () => {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; saveState() }
      for (const d of disposers) { try { d() } catch (err) {} }
    })
  },
}
