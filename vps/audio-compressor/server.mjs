#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Audio compressor microservice (ffmpeg → Opus 16 kHz mono)
// Recibe audio/video por POST, devuelve un .ogg/opus chico apto para Whisper.
// Sin dependencias npm. Pensado para correr detrás de Caddy (HTTPS).
//
// POST /compress
//   Headers: Authorization: Bearer <COMPRESSOR_TOKEN>
//   Body: bytes crudos del audio/video (application/octet-stream)
//   Resp: audio/ogg (opus) comprimido
// GET /health -> 200 ok
//
// Env:
//   PORT              puerto local (default 8723)
//   COMPRESSOR_TOKEN  token compartido con la edge function (obligatorio)
//   BITRATE           bitrate opus (default 12k; ~3.7h entran en <20MB)
//   MAX_INPUT_MB      tope de entrada (default 300)
// ---------------------------------------------------------------------------

import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.env.PORT || 8723)
const TOKEN = process.env.COMPRESSOR_TOKEN
const BITRATE = process.env.BITRATE || '12k'
const MAX_INPUT = Number(process.env.MAX_INPUT_MB || 300) * 1024 * 1024

if (!TOKEN) {
  console.error('Falta COMPRESSOR_TOKEN'); process.exit(1)
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('payload demasiado grande'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function ffmpegToOpus(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    // -vn: descarta video (sirve para mp4). Mono 16kHz opus: ideal para ASR.
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inputPath,
      '-vn', '-ac', '1', '-ar', '16000',
      '-c:a', 'libopus', '-b:a', BITRATE,
      '-f', 'ogg', outputPath,
    ]
    const child = spawn('ffmpeg', args)
    let err = ''
    child.stderr.on('data', (d) => { err += d.toString() })
    child.on('error', (e) => reject(new Error(`no se pudo ejecutar ffmpeg: ${e.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg salió ${code}: ${err.slice(0, 300)}`))
    })
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
    return
  }
  if (req.method !== 'POST' || req.url !== '/compress') {
    res.writeHead(404); res.end('not found'); return
  }
  const auth = req.headers['authorization'] || ''
  if (auth !== `Bearer ${TOKEN}`) {
    res.writeHead(401); res.end('no autorizado'); return
  }

  let dir
  try {
    const body = await readBody(req, MAX_INPUT)
    if (!body.length) { res.writeHead(400); res.end('body vacío'); return }
    dir = await mkdtemp(join(tmpdir(), 'aud-'))
    const inPath = join(dir, 'in')
    const outPath = join(dir, 'out.ogg')
    await writeFile(inPath, body)
    await ffmpegToOpus(inPath, outPath)
    const out = await readFile(outPath)
    res.writeHead(200, { 'Content-Type': 'audio/ogg', 'Content-Length': out.length })
    res.end(out)
    console.log(`compress ok: ${(body.length / 1048576).toFixed(1)}MB -> ${(out.length / 1048576).toFixed(1)}MB`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('compress error:', msg)
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(msg)
  } finally {
    if (dir) rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`audio-compressor escuchando en 127.0.0.1:${PORT} (bitrate ${BITRATE})`)
})
