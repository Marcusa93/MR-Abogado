# Bot de Telegram → Claude Code (VPN Hostinger)

Bot que deja siempre abierto un puente entre Telegram y Claude Code headless,
para disparar tareas de código desde el celular. Usa **long polling** (no
necesita abrir puertos entrantes en la VPN) y **no tiene dependencias npm**.

## Requisitos en la VPN

- Node 18+ (`node -v`)
- Claude Code instalado y autenticado. La forma recomendada (sin costo extra si
  tenés suscripción) es generar un token con tu cuenta:
  ```bash
  ssh -t mr-vps 'claude setup-token'   # seguí el link, pegá el código
  claude -p "hola"                     # debería responder
  ```
  Claude Code se autentica contra Anthropic (suscripción o API key).
  **OpenRouter NO alimenta a Claude Code** (formato distinto); OpenRouter es solo
  para las features de la app, no para este bot.
- Un repo clonado donde el bot va a trabajar (ej: `/root/MR-Abogado-System`)
- Un bot de Telegram creado con [@BotFather](https://t.me/BotFather) (token)
- Tu chat id (escribile a [@userinfobot](https://t.me/userinfobot))

## Deploy

```bash
# 1) Copiar la carpeta a la VPN
scp -r vps/telegram-claude-bot root@TU_VPS:/root/telegram-claude-bot

# 2) En la VPN: configurar entorno
cd /root/telegram-claude-bot
cp .env.example .env
nano .env          # completar token, chat id, WORKDIR

# 3) Prueba manual
node bot.mjs       # mandale /start al bot desde el celular

# 4) Dejarlo siempre abierto con systemd
cp claude-telegram-bot.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now claude-telegram-bot
systemctl status claude-telegram-bot
journalctl -u claude-telegram-bot -f   # ver logs en vivo
```

## Seguridad

- Solo responde a los chat ids de `ALLOWED_CHAT_IDS`. Cualquier otro recibe "No autorizado".
- `CLAUDE_FLAGS=--permission-mode acceptEdits` deja editar archivos sin preguntar
  pero **no** corre comandos arbitrarios sin confirmación. Para autonomía total
  (correr tests, git, etc. sin preguntar) usá `--dangerously-skip-permissions`,
  entendiendo que el bot podrá ejecutar cualquier cosa en la VPN.
- El `.env` tiene el token: no lo commitees (ya está en `.gitignore`).

## Uso

Mandale texto al bot: _"corré el typecheck del frontend y arreglá lo que falle"_.

- **Memoria por chat**: cada mensaje continúa la misma conversación de Claude
  (`sessions.json` + `--resume`). `/nuevo` arranca contexto limpio — conviene
  al cambiar de tema, porque la sesión crece sin límite y resumir una sesión
  gigante es lento y come memoria.
- **Progreso en vivo**: mientras trabaja, el bot edita un mensaje con la
  actividad actual (comando/archivo/herramienta) cada ~4s.
- **Cola**: si mandás otra instrucción mientras trabaja, se encola (hasta
  `MAX_QUEUE`). `/cola` la muestra.
- **Adjuntos**: fotos y documentos (hasta 20 MB, límite del Bot API) se
  descargan a `MEDIA_DIR` y Claude los lee con `Read`. Audio no soportado.

Comandos: `/estado` (repo + cola + sesión), `/diff`, `/log`, `/cola`,
`/cancelar`, `/nuevo`, `/pwd`, `/help`.

## Operación

- El unit tiene `OOMPolicy=continue`: si el kernel mata al proceso `claude`
  por memoria, el bot sigue vivo y reporta el error en vez de morir todo el
  servicio (pasó el 2026-07-15; también se agregó swap de 4 GB al VPS).
- Timeout por tarea: `TASK_TIMEOUT_MS` (30 min). Al vencer, el bot reporta la
  última actividad y el `git status` para que sepas en qué quedó.
- Si el bot "queda trabado": `journalctl -u claude-telegram-bot -n 50`,
  revisar oom-kill, estado del WORKDIR, y como último recurso resetear
  `sessions.json` + `systemctl restart claude-telegram-bot`.
