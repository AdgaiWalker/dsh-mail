import { UI_HTML } from './ui.js'
import PostalMime from 'postal-mime'

const MAX_MESSAGES = 50
const MAX_TEXT = 20000

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

const authorized = (request, env) => {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return Boolean(env.API_TOKEN) && token === env.API_TOKEN
}

// 密码登录：校验 MAIL_PASSWORD，成功后返回 API_TOKEN
// 限流用 KV 存储（Worker 多实例不共享内存，必须用 KV）
const MAX_ATTEMPTS = 8
const WINDOW_SECONDS = 60

async function checkRateLimit(env, ip) {
  const key = `rl:${ip}`
  const raw = await env.MAIL_KV.get(key)
  let count = 0
  if (raw) {
    try { count = Number(JSON.parse(raw).c || 0) } catch { count = 0 }
  }
  count += 1
  if (count > MAX_ATTEMPTS) return false
  // KV 最小过期时间 60 秒
  await env.MAIL_KV.put(key, JSON.stringify({ c: count }), { expirationTtl: WINDOW_SECONDS })
  return true
}

async function handleLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  if (!(await checkRateLimit(env, ip))) {
    return json({ ok: false, error: 'too many attempts, try again later' }, 429)
  }
  if (!env.MAIL_PASSWORD || !env.API_TOKEN) {
    return json({ ok: false, error: 'login not configured' }, 500)
  }
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'invalid body' }, 400)
  }
  const password = String(body?.password || '')
  // 恒定时间比较，避免时序攻击
  const expected = String(env.MAIL_PASSWORD)
  let diff = password.length ^ expected.length
  for (let i = 0; i < Math.max(password.length, expected.length); i++) {
    diff |= (password.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0)
  }
  if (diff !== 0) {
    return json({ ok: false, error: 'wrong password' }, 401)
  }
  await env.MAIL_KV.delete(`rl:${ip}`)
  return json({ ok: true, token: env.API_TOKEN })
}

async function readList(env, key) {
  try {
    const value = await env.MAIL_KV.get(key, 'json')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

async function handleEmail(message, env) {
  try {
    const raw = await new Response(message.raw).arrayBuffer()
    const mail = await PostalMime.parse(raw)
    const to = (mail.to?.[0]?.address || message.to || '').toLowerCase()
    const item = {
      id: crypto.randomUUID(),
      to,
      from: mail.from?.address || '',
      fromName: mail.from?.name || '',
      subject: mail.subject || '',
      date: mail.date || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      text: (mail.text || '').slice(0, MAX_TEXT),
      html: (mail.html || '').slice(0, MAX_TEXT),
    }

    const addressKey = `inbox:${to}`
    const list = await readList(env, addressKey)
    list.unshift(item)
    await env.MAIL_KV.put(addressKey, JSON.stringify(list.slice(0, MAX_MESSAGES)))

    const all = await readList(env, 'inbox:all')
    all.unshift(item)
    await env.MAIL_KV.put('inbox:all', JSON.stringify(all.slice(0, MAX_MESSAGES)))

    return
  } catch (error) {
    console.error('email parse failed', error)
    try {
      message.setReject('Message could not be parsed')
    } catch {}
  }
}

function extractCode(subject = '', text = '') {
  const haystack = `${subject}\n${text}`
  const patterns = [
    /(?:验证码|校验码|确认码|verification code|security code|code)[^0-9A-Z]{0,20}([0-9]{4,8})/i,
    /\b([0-9]{6})\b/,
    /\b([0-9]{4,8})\b/,
    /\b([A-Z0-9]{6})\b/,
  ]
  for (const pattern of patterns) {
    const match = haystack.match(pattern)
    if (match) return match[1]
  }
  return null
}

async function handleFetch(request, env) {
  const url = new URL(request.url)
  if (url.pathname === '/health') return json({ ok: true })

  // 密码登录取 token
  if (url.pathname === '/api/login' && request.method === 'POST') {
    return handleLogin(request, env)
  }

  // 收件箱网页（不需要 API token，页面本身用 hash token 调 API）
  if (url.pathname === '/' || url.pathname === '/index.html') {
    return new Response(UI_HTML, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
    })
  }

  if (!authorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401)

  const to = (url.searchParams.get('to') || 'bot@goodloop.si').toLowerCase()
  const limit = Math.min(Number(url.searchParams.get('limit') || 10), MAX_MESSAGES)

  if (url.pathname === '/api/latest' || url.pathname === '/api/messages') {
    const all = url.searchParams.get('all') === '1'
    const list = await readList(env, all ? 'inbox:all' : `inbox:${to}`)
    return json({ ok: true, to: all ? 'all' : to, count: list.length, messages: list.slice(0, limit) })
  }

  if (url.pathname === '/api/code') {
    const list = await readList(env, `inbox:${to}`)
    for (const message of list.slice(0, limit)) {
      const code = extractCode(message.subject, message.text)
      if (code) {
        return json({
          ok: true,
          to,
          code,
          subject: message.subject,
          from: message.from,
          date: message.date,
          receivedAt: message.receivedAt,
        })
      }
    }
    return json({ ok: false, error: 'no code found', to, checked: Math.min(list.length, limit) }, 404)
  }

  if (url.pathname === '/api/clear' && request.method === 'POST') {
    await env.MAIL_KV.delete(`inbox:${to}`)
    return json({ ok: true, cleared: to })
  }

  return json({ ok: false, error: 'not found' }, 404)
}

export default {
  async email(message, env, ctx) {
    await handleEmail(message, env)
  },
  async fetch(request, env, ctx) {
    return handleFetch(request, env)
  },
}
