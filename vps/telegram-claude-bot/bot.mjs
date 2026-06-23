#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Telegram → Claude Code bridge bot
// Permite disparar tareas de código desde Telegram (celular) contra un repo
// que vive en la VPN. Sin dependencias npm: usa fetch global (Node 18+) y
// spawn de `claude` en modo headless (-p).
//
// Variables de entorno (ver .env.example):
//   TELEGRAM_BOT_TOKEN   token del bot de @BotFather
//   ALLOWED_CHAT_IDS     ids de chat permitidos, separados por coma (solo Marco)
//   WORKDIR              carpeta del repo donde corre claude (default: cwd)
//   CLAUDE_BIN           ruta al binario claude (default: "claude")
//   CLAUDE_FLAGS         flags extra para claude (default: "--permission-mode acceptEdits")
//   TASK_TIMEOUT_MS      timeout por tarea (default: 1200000 = 20 min)
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process'

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ALLOWED = new Set(
  (process.env.ALLOWED_CHAT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
)
const WORKDIR = process.env.WORKDIR || process.cwd()
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const CLAUDE_FLAGS = (process.env.CLAUDE_FLAGS ?? '--permission-mode acceptEdits').split(' ').filter(Boolean)
const TASK_TIMEOUT_MS = Number(process.env.TASK_TIMEOUT_MS ?? 1_200_000)

if (!TOKEN) {
  console.error('Falta TELEGRAM_BOT_TOKEN'); process.exit(1)
}
if (ALLOWED.size === 0) {
  console.error('Falta ALLOWED_CHAT_IDS (no se permite ningún chat).'); process.exit(1)
}

const API = `https://api.telegram.org/bot${TOKEN}`
let busy = false

async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// Telegram corta los mensajes en 4096 chars; los partimos.
async function send(chatId, text) {
  const MAX = 3800
  const clean = text.length ? text : '(sin salida)'
  for (let i = 0; i < clean.length; i += MAX) {
    await tg('sendMessage', { chat_id: chatId, text: clean.slice(i, i + MAX) })
  }
}

function runClaude(prompt) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, ...CLAUDE_FLAGS]
    const child = spawn(CLAUDE_BIN, args, { cwd: WORKDIR, env: process.env })
    let out = '', err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ ok: false, text: '⏱️ Tarea cancelada por timeout.' })
    }, TASK_TIMEOUT_MS)
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { err += d.toString() })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, text: `No se pudo ejecutar claude: ${e.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const body = out.trim() || err.trim()
      resolve({ ok: code === 0, text: code === 0 ? body : `claude salió con código ${code}.\n${body}` })
    })
  })
}

async function handle(msg) {
  const chatId = String(msg.chat?.id ?? '')
  const text = (msg.text ?? '').trim()
  if (!ALLOWED.has(chatId)) {
    await send(chatId, '⛔ No autorizado.')
    console.warn('Mensaje de chat no autorizado:', chatId)
    return
  }
  if (!text) return

  if (text === '/start' || text === '/help') {
    await send(chatId,
      'Bot de Claude Code listo.\n\n' +
      `Repo: ${WORKDIR}\n\n` +
      'Mandame una instrucción y la ejecuto con Claude Code.\n' +
      'Ej: "corré los tests del frontend" o "arreglá el typecheck".\n\n' +
      'Comandos: /pwd (carpeta), /help')
    return
  }
  if (text === '/pwd') { await send(chatId, WORKDIR); return }

  if (busy) {
    await send(chatId, '⏳ Hay una tarea en curso. Esperá a que termine.')
    return
  }
  busy = true
  await tg('sendChatAction', { chat_id: chatId, action: 'typing' })
  await send(chatId, '🤖 Procesando…')
  try {
    const r = await runClaude(text)
    await send(chatId, `${r.ok ? '✅' : '⚠️'} ${r.text}`)
  } catch (e) {
    await send(chatId, `Error: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    busy = false
  }
}

// Long polling — no requiere abrir puertos entrantes en la VPN.
async function main() {
  console.log(`Bot arrancado. WORKDIR=${WORKDIR}. Chats permitidos: ${[...ALLOWED].join(', ')}`)
  let offset = 0
  // Limpiar webhook por si quedó configurado.
  await tg('deleteWebhook', { drop_pending_updates: false }).catch(() => {})
  for (;;) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=50&offset=${offset}`)
      const data = await res.json()
      if (!data.ok) { await new Promise((r) => setTimeout(r, 2000)); continue }
      for (const upd of data.result) {
        offset = upd.update_id + 1
        if (upd.message) await handle(upd.message)
      }
    } catch (e) {
      console.error('Loop error:', e instanceof Error ? e.message : e)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

main()
