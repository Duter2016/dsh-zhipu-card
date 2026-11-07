// dsh-zhipu-card 前端：胶囊+卡片（样式取自 dsh-quota-panel 的右下角结构，vanilla JS 无依赖）
(function () {
  'use strict'
  var BASE = '/dsh-zhipu-card'
  if (document.getElementById('zhipu-card')) return

  var css = [
    '#zhipu-card{position:fixed;right:18px;bottom:18px;z-index:900;display:flex;flex-direction:column;align-items:flex-end;color:#1b1b1c;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:13px;line-height:1.45}',
    '#zc-capsule{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px 0 14px;border:1px solid rgba(0,0,0,.1);border-radius:18px;background:#fff;box-shadow:0 4px 12px rgba(15,17,21,.02),0 2px 8px rgba(15,17,21,.04);cursor:pointer;transition:background-color 120ms ease;touch-action:none}',
    '#zc-capsule:hover{background:#ebeef2}',
    '#zc-dot{flex:none;width:8px;height:8px;border-radius:50%;background:#adb2b8}',
    '#zc-dot.ok{background:#22c55e}#zc-dot.warn{background:#f59e0b}#zc-dot.error{background:#ef4444}',
    '#zc-capsule .zc-val{font-variant-numeric:tabular-nums;white-space:nowrap}',
    '#zc-card{display:none;width:280px;max-width:calc(100vw - 36px);margin-top:8px;padding:14px 16px 15px;border:1px solid rgba(0,0,0,.1);border-radius:16px;background:#fff;box-shadow:0 8px 26px rgba(15,17,21,.1),0 2px 6px rgba(15,17,21,.06);box-sizing:border-box}',
    '#zc-card.open{display:block}',
    '#zc-card .zc-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:14px;font-weight:600}',
    '#zc-card .zc-row{display:flex;justify-content:space-between;padding:4px 0;color:#1b1b1c}',
    '#zc-card .zc-row .zc-label{color:#61666b}',
    '#zc-card .zc-row .zc-num{font-variant-numeric:tabular-nums;font-weight:600}',
    '#zc-card .zc-bar{position:relative;height:5px;margin-top:10px;border-radius:999px;background:#ebeef2;overflow:hidden}',
    '#zc-card .zc-fill{height:100%;width:0;border-radius:inherit;background:#4176e6;transition:width .3s ease}',
    '#zc-card .zc-bar.warn .zc-fill{background:#f59e0b}#zc-card .zc-bar.error .zc-fill{background:#ef4444}',
    '#zc-card .zc-err{margin-top:6px;color:#ef4444;font-size:12px;word-break:break-all}',
    '#zc-card .zc-set{margin-top:12px;padding-top:10px;border-top:1px solid rgba(0,0,0,.06)}',
    '#zc-card .zc-set .zc-srow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:3px 0}',
    '#zc-card .zc-set label{color:#61666b;font-size:12px}',
    '#zc-card input,#zc-card select{width:120px;padding:3px 8px;border:1px solid rgba(0,0,0,.14);border-radius:8px;font:inherit;font-size:12px;box-sizing:border-box}',
    '#zc-card textarea{width:100%;margin-top:6px;padding:6px 8px;border:1px solid rgba(0,0,0,.14);border-radius:8px;font:12px ui-monospace,monospace;box-sizing:border-box;min-height:56px}',
    '#zc-card .zc-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}',
    '#zc-card button{padding:4px 12px;border:1px solid rgba(0,0,0,.14);border-radius:8px;background:#fff;cursor:pointer;font:inherit;font-size:12px}',
    '#zc-card button.zc-primary{background:#4176e6;border-color:#4176e6;color:#fff}',
  ].join('\n')

  var style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)

  var root = document.createElement('div')
  root.id = 'zhipu-card'
  root.innerHTML =
    '<div id="zc-capsule"><span id="zc-dot"></span><span class="zc-val" id="zc-val">…</span></div>' +
    '<div id="zc-card">' +
      '<div class="zc-title"><span id="zc-title-txt">智谱 GLM 额度</span><span id="zc-key" style="font-size:11px;font-weight:400;color:#818590"></span><span id="zc-close" style="cursor:pointer;font-size:16px;padding:0 2px;color:#818590" title="收起">×</span></div>' +
      '<div class="zc-row"><span class="zc-label">剩余额度</span><span class="zc-num" id="zc-remaining">—</span></div>' +
      '<div class="zc-row"><span class="zc-label">已用（窗口内）</span><span class="zc-num" id="zc-used">—</span></div>' +
      '<div class="zc-row"><span class="zc-label">今日已用</span><span class="zc-num" id="zc-today">—</span></div>' +
      '<div class="zc-row"><span class="zc-label">缓存命中率</span><span class="zc-num" id="zc-hit">—</span></div>' +
      '<div class="zc-row"><span class="zc-label">上下文占用</span><span class="zc-num" id="zc-ctx">—</span></div>' +
      '<div class="zc-bar"><div class="zc-fill" id="zc-fill"></div></div>' +
      '<div class="zc-err" id="zc-err" style="display:none"></div>' +
      '<div class="zc-set">' +
        '<div class="zc-srow"><label>计费时段</label><span id="zc-tariff" style="font-size:12px;font-weight:600;color:#61666b">…</span></div>' +
        '<div class="zc-srow"><label id="zc-tariff-note" style="font-size:11px;color:#818590;text-align:right;line-height:1.3"></label></div>' +
        '<div class="zc-srow"><label>总量</label><input id="zc-total" type="number" min="0" step="any"></div>' +
        '<div class="zc-srow"><label>口径</label><select id="zc-unit"><option value="money">金额（元）</option><option value="tokens">token</option></select></div>' +
        '<div class="zc-srow"><label>实际余额校准</label><input id="zc-actual" type="number" step="any" placeholder="填当前真实余额"></div>' +
        '<div class="zc-srow"><label>当前校准偏差</label><span id="zc-offset" style="font-size:12px;color:#61666b">0</span></div>' +
        '<div class="zc-srow"><label>重置</label><select id="zc-reset"><option value="none">不重置</option><option value="daily">每日</option><option value="monthly">每月</option></select></div>' +
        '<label style="display:block;margin-top:6px">单价覆盖（JSON：{"模型名":{"in":元,"cache":元,"out":元}/百万token}）</label>' +
        '<textarea id="zc-prices" spellcheck="false"></textarea>' +
        '<div class="zc-actions"><button id="zc-save" class="zc-primary">保存</button></div>' +
      '</div>' +
    '</div>'
  ;(document.body || document.documentElement).appendChild(root)

  function fmtMoney(n) { return '¥' + (Math.round(n * 100) / 100).toFixed(2) }
  function fmtTokens(n) {
    n = Math.round(n)
    if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿'
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '万'
    return String(n)
  }
  function fmt(used, unit) { return unit === 'money' ? fmtMoney(used.cost) + '（' + fmtTokens(used.tokens) + ' tok）' : fmtTokens(used.tokens) }

  function render(s) {
    var dot = document.getElementById('zc-dot')
    dot.className = s.keyValid ? 'ok' : (s.hasKey ? 'warn' : 'error')
    document.getElementById('zc-key').textContent = s.keyValid ? 'key ✓' : (s.hasKey ? 'key 异常' : '无 key')
    var hitDen = s.sess ? s.sess.tokens : 0 // 当前会话口径
    var hitTxt = hitDen > 0 ? ' · ' + Math.round((s.sess ? s.sess.cache : 0) / hitDen * 100) + '%' : ''
    document.getElementById('zc-val').textContent = (s.name || '智谱') + ' ' + (s.remaining < 0 ? '超额' :
      (s.unit === 'money' ? fmtMoney(s.remaining) : fmtTokens(s.remaining))) + hitTxt
    document.getElementById('zc-remaining').textContent = s.unit === 'money' ? fmtMoney(s.remaining) : fmtTokens(s.remaining)
    document.getElementById('zc-used').textContent = fmt(s.used, s.unit)
    document.getElementById('zc-today').textContent = fmt(s.today, s.unit)
    var den = s.sess ? s.sess.tokens : 0 // 当前会话口径（会话cache/会话全部token）
    var t = document.getElementById('zc-title-txt')
    if (t && s.ver) t.textContent = t.textContent.split(' v')[0] + ' v' + s.ver
    document.getElementById('zc-hit').textContent = den > 0 ? Math.round((s.sess ? s.sess.cache : 0) / den * 100) + '%' : '—'
    var ctxEl = document.getElementById('zc-ctx')
    if (s.ctx && s.ctx.tokens > 0) {
      var pct = Math.min(100, Math.round(s.ctx.tokens / s.ctx.limit * 100))
      ctxEl.textContent = pct + '% · ' + fmtTokens(s.ctx.tokens) + ' / ' + fmtTokens(s.ctx.limit)
      ctxEl.style.color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : ''
    } else ctxEl.textContent = '—'
    var pct = s.total > 0 ? Math.min(100, Math.max(0, (1 - Math.max(0, s.remaining) / s.total) * 100)) : 0
    document.getElementById('zc-fill').style.width = pct + '%'
    var bar = root.querySelector('.zc-bar')
    bar.className = 'zc-bar' + (pct >= 90 ? ' error' : pct >= 70 ? ' warn' : '')
    var err = document.getElementById('zc-err')
    if (s.hasKey && !s.keyValid) { err.style.display = 'block'; err.textContent = 'key 探活失败：请检查 ' + 'ZAI_API_KEY' } else err.style.display = 'none'
    // 计费时段：智谱按量计费全天统一价（峰谷半价仅限 Coding Plan 积分体系）
    var tf = s.tariff, tEl = document.getElementById('zc-tariff'), tNote = document.getElementById('zc-tariff-note')
    if (tf && tf.price) {
      var p = tf.price
      tEl.textContent = '全天统一价 · in ' + p.in + ' / cache ' + p.cache + ' / out ' + p.out + ' 元/M'
      tEl.style.color = '#61666b'
      tNote.textContent = '按量计费无峰谷（峰谷半价仅限 Coding Plan 积分）'
    } else { tEl.textContent = '—'; tNote.textContent = '' }
  }

  function load() {
    fetch(BASE + '/summary.json').then(function (r) { return r.json() }).then(render).catch(function () {
      document.getElementById('zc-val').textContent = '—'
    })
  }

  // 卡片展开时回填设置
  function fillSettings(s) {
    document.getElementById('zc-total').value = s.total || 0
    document.getElementById('zc-unit').value = s.unit
    document.getElementById('zc-reset').value = s.reset
    document.getElementById('zc-offset').textContent = (s.offset || 0).toFixed(2)
    document.getElementById('zc-actual').value = ''
    document.getElementById('zc-prices').value = JSON.stringify(s.prices || {}, null, 1)
  }

  // 拖拽：按住胶囊移动位置，localStorage 记忆；位移超过 5px 视为拖拽（不触发卡片开合）
  var POS_KEY = 'zhipu-card:pos'
  try {
    var saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null')
    if (saved) { root.style.right = saved.right + 'px'; root.style.bottom = saved.bottom + 'px' }
  } catch (e) {}
  var drag = null
  var capsule = document.getElementById('zc-capsule')
  capsule.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return
    var r = root.getBoundingClientRect()
    drag = { sx: e.clientX, sy: e.clientY, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom, moved: false }
    capsule.setPointerCapture(e.pointerId)
  })
  capsule.addEventListener('pointermove', function (e) {
    if (!drag) return
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy
    if (!drag.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return
    drag.moved = true
    var right = Math.max(0, Math.min(window.innerWidth - 60, drag.right - dx))
    var bottom = Math.max(0, Math.min(window.innerHeight - 60, drag.bottom - dy))
    root.style.right = right + 'px'
    root.style.bottom = bottom + 'px'
  })
  capsule.addEventListener('pointerup', function (e) {
    if (!drag) return
    if (drag.moved) {
      var r = root.getBoundingClientRect()
      try { localStorage.setItem(POS_KEY, JSON.stringify({ right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom })) } catch (err) {}
    }
    var moved = drag.moved
    drag = null
    if (moved) e.stopImmediatePropagation() // 拖完不触发点击
  })

  function closeCard() { document.getElementById('zc-card').classList.remove('open') }
  document.getElementById('zc-close').addEventListener('click', function (e) { e.stopPropagation(); closeCard() })
  // 点击卡片以外区域收起（胶囊自身除外）
  document.addEventListener('pointerdown', function (e) {
    var card = document.getElementById('zc-card')
    if (!card.classList.contains('open')) return
    if (card.contains(e.target) || capsule.contains(e.target)) return
    closeCard()
  })

  document.getElementById('zc-capsule').addEventListener('click', function () {
    var card = document.getElementById('zc-card')
    var opening = !card.classList.contains('open')
    card.classList.toggle('open')
    if (opening) fetch(BASE + '/summary.json').then(function (r) { return r.json() }).then(function (s) { render(s); fillSettings(s) })
  })

  document.getElementById('zc-save').addEventListener('click', function () {
    var prices = {}
    try { prices = JSON.parse(document.getElementById('zc-prices').value || '{}') } catch (e) {}
    fetch(BASE + '/settings.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total: Number(document.getElementById('zc-total').value) || 0,
        actual: (function () { var v = document.getElementById('zc-actual').value; return v === '' ? undefined : Number(v) })(),
        unit: document.getElementById('zc-unit').value,
        reset: document.getElementById('zc-reset').value,
        prices: prices,
      }),
    }).then(load)
  })

  load()
  setInterval(load, 60000)
})()
