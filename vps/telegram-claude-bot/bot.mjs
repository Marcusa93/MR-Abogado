#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Telegram -> Claude Code bridge bot
// Permite disparar tareas de codigo desde Telegram (celular) contra un repo
// que vive en la VPS. Sin dependencias npm: usa fetch global (Node 18+) y
// spawn de `claude` en modo headless (-p, stream-json).
//
// Features:
//   - Memoria por chat: session-id persistido (sessions.json) + --resume.
//     /nuevo reinicia el contexto.
//   - Progreso en vivo: parsea el stream-json de claude y edita un mensaje
//     de Telegram con la actividad actual (herramienta / archivo / comando).
//   - Cola de tareas: los mensajes que llegan durante una tarea se encolan
//     en orden en vez de rechazarse. /cola la muestra, /cancelar corta la
//     tarea en curso.
//   - Adjuntos: fotos y documentos se descargan a MEDIA_DIR y se le pasan
//     a claude como ruta para que los lea con Read.
//   - /estado, /diff, /log: estado del repo sin abrir una tarea de claude.
//
// Variables de entorno (ver README):
//   TELEGRAM_BOT_TOKEN   token del bot de @BotFather
//   ALLOWED_CHAT_IDS     ids de chat permitidos, separados por coma (solo Marco)
//   WORKDIR              carpeta del repo donde corre claude (default: cwd)
//   CLAUDE_BIN           ruta al binario claude (default: "claude")
//   CLAUDE_FLAGS         flags extra para claude (default: "--dangerously-skip-permissions")
//   TASK_TIMEOUT_MS      timeout por tarea (default: 1800000 = 30 min)
//   SESSIONS_FILE        archivo json de session-ids por chat (default: ./sessions.json)
//   MEDIA_DIR            carpeta para adjuntos descargados (default: ./media)
//   MAX_QUEUE            maximo de tareas encoladas (default: 5)
// ---------------------------------------------------------------------------

import { execFile, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileP = promisify(execFile)

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ALLOWED = new Set(
  (process.env.ALLOWED_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
)
const WORKDIR = process.env.WORKDIR || process.cwd()
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude"
const CLAUDE_FLAGS = (process.env.CLAUDE_FLAGS ?? "--dangerously-skip-permissions").split(" ").filter(Boolean)
const TASK_TIMEOUT_MS = Number(process.env.TASK_TIMEOUT_MS ?? 1_800_000)
const SESSIONS_FILE = process.env.SESSIONS_FILE || fileURLToPath(new URL("./sessions.json", import.meta.url))
const MEDIA_DIR = process.env.MEDIA_DIR || fileURLToPath(new URL("./media", import.meta.url))
const MAX_QUEUE = Number(process.env.MAX_QUEUE ?? 5)
const PROGRESS_EVERY_MS = 4000
const SESSION_WARN_MB = 10

if (!TOKEN) {
  console.error("Falta TELEGRAM_BOT_TOKEN"); process.exit(1)
}
if (ALLOWED.size === 0) {
  console.error("Falta ALLOWED_CHAT_IDS (no se permite ningun chat)."); process.exit(1)
}
mkdirSync(MEDIA_DIR, { recursive: true })

const API = `https://api.telegram.org/bot${TOKEN}`

// --- persistencia de sesiones por chat ------------------------------------
function loadSessions() {
  try { return JSON.parse(readFileSync(SESSIONS_FILE, "utf8")) } catch { return {} }
}
function saveSessions(s) {
  try { writeFileSync(SESSIONS_FILE, JSON.stringify(s, null, 2)) }
  catch (e) { console.error("No pude guardar sessions:", e instanceof Error ? e.message : e) }
}
let sessions = loadSessions()

// --- helpers Telegram -------------------------------------------------------
async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json()
}

// Telegram corta los mensajes en 4096 chars; los partimos.
async function send(chatId, text) {
  const MAX = 3800
  const clean = text.length ? text : "(sin salida)"
  for (let i = 0; i < clean.length; i += MAX) {
    await tg("sendMessage", { chat_id: chatId, text: clean.slice(i, i + MAX) })
  }
}

async function downloadTgFile(fileId, hint = "archivo") {
  const info = await tg("getFile", { file_id: fileId })
  if (!info.ok) throw new Error(info.description || "getFile fallo (max 20MB por archivo)")
  const remote = info.result.file_path
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${remote}`)
  if (!res.ok) throw new Error(`descarga HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const base = (remote.split("/").pop() || hint).replace(/[^\w.\-]/g, "_")
  const dest = `${MEDIA_DIR}/${Date.now()}-${base}`
  writeFileSync(dest, buf)
  return dest
}

// --- helpers varios ---------------------------------------------------------
function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

// Tamano del jsonl de la sesion en ~/.claude/projects/<workdir-codificado>/.
function sessionSizeMB(sid) {
  if (!sid) return 0
  const proj = WORKDIR.replace(/[^a-zA-Z0-9]/g, "-")
  try {
    return statSync(`${process.env.HOME || "/root"}/.claude/projects/${proj}/${sid}.jsonl`).size / 1e6
  } catch { return 0 }
}

async function git(...args) {
  try {
    const { stdout } = await execFileP("git", args, { cwd: WORKDIR, timeout: 20_000 })
    return stdout.trim()
  } catch (e) {
    return `(git error: ${e instanceof Error ? e.message : e})`
  }
}

function describeTool(name, input = {}) {
  const clip = (s, n = 90) => String(s ?? "").slice(0, n)
  if (name === "Bash") return `Bash: ${clip(input.description || input.command)}`
  if (["Edit", "Write", "Read", "NotebookEdit"].includes(name)) {
    return `${name}: ${clip(String(input.file_path ?? "").split("/").slice(-3).join("/"))}`
  }
  if (name === "Grep" || name === "Glob") return clip(`${name}: ${input.pattern ?? ""}`)
  if (name === "Task") return `Agente: ${clip(input.description)}`
  if (name === "TodoWrite") return "Actualizando plan de trabajo"
  if (name === "WebFetch" || name === "WebSearch") return clip(`${name}: ${input.url ?? input.query ?? ""}`)
  return name
}

// --- ejecucion de claude (stream-json) --------------------------------------
function runClaude(job) {
  return new Promise((resolve) => {
    const chatId = job.chatId
    let sid = sessions[chatId]
    const usingResume = Boolean(sid)
    if (!sid) {
      sid = randomUUID()
      sessions[chatId] = sid
      saveSessions(sessions)
    }
    const sessionArgs = usingResume ? ["--resume", sid] : ["--session-id", sid]
    const args = ["-p", job.prompt, ...sessionArgs, "--output-format", "stream-json", "--verbose", ...CLAUDE_FLAGS]
    const child = spawn(CLAUDE_BIN, args, { cwd: WORKDIR, env: process.env })
    job.child = child

    let buf = "", err = "", lastText = "", resultEv = null
    const timer = setTimeout(() => {
      job.timedOut = true
      try { child.kill("SIGTERM") } catch {}
      setTimeout(() => { try { child.kill("SIGKILL") } catch {} }, 8000).unref()
    }, TASK_TIMEOUT_MS)

    const onLine = (line) => {
      let ev
      try { ev = JSON.parse(line) } catch { return }
      if (ev.type === "assistant") {
        for (const b of ev.message?.content ?? []) {
          if (b.type === "text" && b.text?.trim()) {
            lastText = b.text.trim()
            job.lastActivity = `> ${lastText.slice(0, 120).replace(/\s+/g, " ")}`
          } else if (b.type === "tool_use") {
            job.lastActivity = describeTool(b.name, b.input)
          }
        }
      } else if (ev.type === "result") {
        resultEv = ev
      }
    }
    child.stdout.on("data", (d) => {
      buf += d.toString()
      let i
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (line) onLine(line)
      }
    })
    child.stderr.on("data", (d) => { err += d.toString() })
    child.on("error", (e) => {
      clearTimeout(timer)
      resolve({ ok: false, text: `No se pudo ejecutar claude: ${e.message}` })
    })
    child.on("close", async (code) => {
      clearTimeout(timer)
      if (job.cancelled) {
        resolve({ ok: false, text: "Tarea cancelada." })
        return
      }
      if (job.timedOut) {
        const st = await git("status", "--short")
        resolve({
          ok: false,
          text: `Tarea cancelada por timeout (${fmtDur(TASK_TIMEOUT_MS)}).\n`
            + `Ultima actividad: ${job.lastActivity ?? "(desconocida)"}\n\n`
            + `Estado del repo:\n${st || "(limpio)"}`,
        })
        return
      }
      // Si el --resume fallo porque la sesion ya no existe (cleanup), reintentar fresco.
      if (code !== 0 && usingResume
        && /no conversation|session.*not found|no such session|could not find/i.test(`${err} ${resultEv?.result ?? ""}`)) {
        delete sessions[chatId]
        saveSessions(sessions)
        resolve(runClaude(job))
        return
      }
      // Algunas versiones de la CLI forkean el session-id al resumir: persistir el vigente.
      if (resultEv?.session_id && resultEv.session_id !== sessions[chatId]) {
        sessions[chatId] = resultEv.session_id
        saveSessions(sessions)
      }
      const finalText = (typeof resultEv?.result === "string" && resultEv.result.trim())
        || lastText || err.trim()
      const ok = resultEv ? !resultEv.is_error : code === 0
      let footer = ""
      if (resultEv?.num_turns) footer += `\n\n(${resultEv.num_turns} pasos, ${fmtDur(resultEv.duration_ms ?? 0)})`
      const mb = sessionSizeMB(sessions[chatId])
      if (mb > SESSION_WARN_MB) {
        footer += `\nNota: la sesion acumula ${mb.toFixed(0)} MB; si cambias de tema, /nuevo la aliviana.`
      }
      resolve({
        ok,
        text: (ok ? finalText : `claude salio con codigo ${code}.\n${finalText}`) + footer,
      })
    })
  })
}

// --- cola de tareas ----------------------------------------------------------
const queue = []
let current = null
let pumping = false

function enqueue(chatId, prompt, label) {
  if (queue.length >= MAX_QUEUE) {
    send(chatId, `Cola llena (${MAX_QUEUE}). Espera o cancela con /cancelar.`).catch(() => {})
    return
  }
  const job = {
    chatId, prompt,
    label: label.replace(/\s+/g, " ").slice(0, 60),
    startedAt: 0, lastActivity: null, child: null,
    cancelled: false, timedOut: false,
  }
  queue.push(job)
  if (current) {
    send(chatId, `Encolada detras de la tarea en curso (#${queue.length} en cola).`).catch(() => {})
  }
  pump()
}

async function pump() {
  if (pumping) return
  pumping = true
  while (queue.length) {
    const job = queue.shift()
    current = job
    try { await runJob(job) }
    catch (e) {
      console.error("Error en tarea:", e instanceof Error ? e.message : e)
      await send(job.chatId, `Error: ${e instanceof Error ? e.message : e}`).catch(() => {})
    }
    current = null
  }
  pumping = false
}

async function runJob(job) {
  job.startedAt = Date.now()
  const sent = await tg("sendMessage", { chat_id: job.chatId, text: `En curso: ${job.label}` }).catch(() => null)
  const progressId = sent?.result?.message_id
  let lastShown = ""
  const timer = setInterval(() => {
    tg("sendChatAction", { chat_id: job.chatId, action: "typing" }).catch(() => {})
    if (!progressId) return
    const text = `En curso (${fmtDur(Date.now() - job.startedAt)}): ${job.label}\n${job.lastActivity ?? "arrancando..."}`
    if (text === lastShown) return
    lastShown = text
    tg("editMessageText", { chat_id: job.chatId, message_id: progressId, text }).catch(() => {})
  }, PROGRESS_EVERY_MS)
  try {
    const r = await runClaude(job)
    if (progressId) {
      await tg("editMessageText", {
        chat_id: job.chatId, message_id: progressId,
        text: `${r.ok ? "Terminada" : "Fallo"} (${fmtDur(Date.now() - job.startedAt)}): ${job.label}`,
      }).catch(() => {})
    }
    // Mensaje nuevo (no edit) para que suene la notificacion.
    await send(job.chatId, `${r.ok ? "OK" : "ATENCION"} ${r.text}`)
  } finally {
    clearInterval(timer)
  }
}

// --- comandos ----------------------------------------------------------------
const HELP = [
  "Bot de Claude Code.",
  "",
  "Mandame una instruccion y la ejecuto con Claude Code sobre el repo.",
  "Mantengo el contexto entre mensajes. Si llega otra instruccion mientras",
  "trabajo, se encola. Fotos y documentos adjuntos se le pasan a Claude.",
  "",
  "Comandos:",
  "/estado - repo: rama, cambios, ultimos commits, cola, sesion",
  "/diff - cambios sin commitear",
  "/log - ultimos 10 commits",
  "/cola - tarea en curso y encoladas",
  "/cancelar - corta la tarea en curso",
  "/nuevo - reinicia el contexto de conversacion",
  "/pwd - carpeta de trabajo",
].join("\n")

async function cmdEstado(chatId) {
  await git("fetch", "--quiet", "origin")
  const sb = await git("status", "-sb")
  const lines = sb.split("\n")
  const head = lines[0] ?? ""
  const dirty = lines.slice(1, 16).join("\n")
  const commits = await git("log", "--oneline", "-3")
  const sid = sessions[chatId]
  const mb = sessionSizeMB(sid)
  const parts = [
    `Rama: ${head.replace(/^## /, "")}`,
    dirty ? `Sin commitear:\n${dirty}` : "Sin commitear: (nada)",
    `Ultimos commits:\n${commits}`,
    `Cola: ${current ? `1 en curso (${current.label})` : "libre"}${queue.length ? ` + ${queue.length} esperando` : ""}`,
    `Sesion: ${sid ? `${mb.toFixed(1)} MB` : "(nueva)"} | Bot corriendo hace ${fmtDur(process.uptime() * 1000)}`,
  ]
  await send(chatId, parts.join("\n\n"))
}

async function handleCommand(chatId, text) {
  if (text === "/start" || text === "/help") { await send(chatId, HELP); return true }
  if (text === "/pwd") { await send(chatId, WORKDIR); return true }
  if (text === "/nuevo" || text === "/reset") {
    delete sessions[chatId]
    saveSessions(sessions)
    await send(chatId, "Contexto reiniciado. La proxima instruccion arranca conversacion nueva.")
    return true
  }
  if (text === "/estado" || text === "/status") { await cmdEstado(chatId); return true }
  if (text === "/diff") {
    const stat = await git("diff", "--stat")
    const untracked = await git("ls-files", "--others", "--exclude-standard")
    const body = [stat || "(sin cambios trackeados)", untracked ? `Nuevos sin trackear:\n${untracked}` : ""]
      .filter(Boolean).join("\n\n")
    await send(chatId, body)
    return true
  }
  if (text === "/log") { await send(chatId, await git("log", "--oneline", "-10")); return true }
  if (text === "/cola") {
    const lines = []
    if (current) lines.push(`En curso (${fmtDur(Date.now() - current.startedAt)}): ${current.label}`)
    queue.forEach((j, i) => lines.push(`${i + 1}. ${j.label}`))
    await send(chatId, lines.join("\n") || "Cola vacia, sin tareas en curso.")
    return true
  }
  if (text === "/cancelar" || text === "/cancel") {
    if (!current) { await send(chatId, "No hay tarea en curso."); return true }
    current.cancelled = true
    const ref = current
    try { ref.child?.kill("SIGTERM") } catch {}
    setTimeout(() => { try { ref.child?.kill("SIGKILL") } catch {} }, 8000).unref()
    await send(chatId, `Cancelando: ${ref.label}`)
    return true
  }
  return false
}

// --- entrada de mensajes -------------------------------------------------------
async function handle(msg) {
  const chatId = String(msg.chat?.id ?? "")
  if (!ALLOWED.has(chatId)) {
    await send(chatId, "No autorizado.")
    console.warn("Mensaje de chat no autorizado:", chatId)
    return
  }

  const text = (msg.text ?? msg.caption ?? "").trim()

  if (msg.voice || msg.audio || msg.video_note) {
    await send(chatId, "Audio/video no soportado todavia. Mandame texto, foto o documento.")
    return
  }

  const attachments = []
  try {
    if (msg.photo?.length) {
      const ph = msg.photo[msg.photo.length - 1] // la resolucion mas grande
      attachments.push(await downloadTgFile(ph.file_id, "foto.jpg"))
    }
    if (msg.document) {
      attachments.push(await downloadTgFile(msg.document.file_id, msg.document.file_name || "documento"))
    }
  } catch (e) {
    await send(chatId, `No pude descargar el adjunto: ${e instanceof Error ? e.message : e}`)
    return
  }

  if (!text && attachments.length === 0) return

  if (attachments.length === 0 && text.startsWith("/")) {
    if (await handleCommand(chatId, text)) return
  }

  let prompt = text
  if (attachments.length) {
    prompt = `${text || "Mira el adjunto y decime que contiene y que conviene hacer."}\n\n`
      + attachments.map((p) => `Adjunto del usuario guardado en: ${p} (leelo con la herramienta Read)`).join("\n")
  }
  enqueue(chatId, prompt, text || `(adjunto: ${attachments.length})`)
}

// Long polling -- no requiere abrir puertos entrantes.
async function main() {
  console.log(`Bot arrancado. WORKDIR=${WORKDIR}. Chats permitidos: ${[...ALLOWED].join(", ")}`)
  let offset = 0
  await tg("deleteWebhook", { drop_pending_updates: false }).catch(() => {})
  for (;;) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=50&offset=${offset}`)
      const data = await res.json()
      if (!data.ok) { await new Promise((r) => setTimeout(r, 2000)); continue }
      for (const upd of data.result) {
        offset = upd.update_id + 1
        if (upd.message) {
          try { await handle(upd.message) }
          catch (e) { console.error("Error en handle:", e instanceof Error ? e.message : e) }
        }
      }
    } catch (e) {
      console.error("Loop error:", e instanceof Error ? e.message : e)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

main()
