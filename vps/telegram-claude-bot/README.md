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

**Cada bot corre bajo su propio usuario Linux sin privilegios** (no root) —
si tenés más de un bot en la misma VPN, esto evita que uno comprometido pueda
leer el `.env`/repo de los otros. Un usuario, un `home`, una deploy key.

```bash
# 1) Crear el usuario dedicado (una sola vez, por bot)
useradd -m -s /bin/bash -d /home/<usuario-bot> <usuario-bot>

# 2) Copiar la carpeta a su home
scp -r vps/telegram-claude-bot root@TU_VPS:/home/<usuario-bot>/telegram-claude-bot
# clonar el repo también dentro de /home/<usuario-bot>/
chown -R <usuario-bot>:<usuario-bot> /home/<usuario-bot>

# 3) Deploy key de ese repo (solo esa, no la de otros bots) en su .ssh:
#    /home/<usuario-bot>/.ssh/{key,key.pub,config,known_hosts}, permisos 600/700,
#    dueño <usuario-bot>. El config apunta IdentityFile a esa key para github.com.

# 4) En la VPN: configurar entorno
sudo -u <usuario-bot> -H bash -c "cd ~/telegram-claude-bot && cp .env.example .env"
nano /home/<usuario-bot>/telegram-claude-bot/.env   # token, chat id, WORKDIR=/home/<usuario-bot>/<repo>

# 5) Prueba manual como ese usuario
sudo -u <usuario-bot> -H node /home/<usuario-bot>/telegram-claude-bot/bot.mjs

# 6) Dejarlo siempre abierto con systemd (User=/Group=/rutas del unit ya
#    apuntan al usuario dedicado, ver claude-telegram-bot.service)
cp claude-telegram-bot.service /etc/systemd/system/claude-telegram-bot-<usuario-bot>.service
# editar User/Group/WorkingDirectory/EnvironmentFile/ExecStart si el nombre difiere
systemctl daemon-reload
systemctl enable --now claude-telegram-bot-<usuario-bot>
journalctl -u claude-telegram-bot-<usuario-bot> -f
```

## Seguridad

- Solo responde a los chat ids de `ALLOWED_CHAT_IDS`. Cualquier otro recibe "No autorizado".
- **Usuario dedicado sin privilegios, no root.** `--dangerously-skip-permissions`
  no necesita ningún flag extra (`IS_SANDBOX`) corriendo como usuario normal —
  ese hack solo hacía falta cuando el bot corría como root. Con usuario propio,
  aunque el bot ejecute cualquier comando en la VPN, queda contenido a lo que
  ese usuario puede tocar: su propio `$HOME`, nada de `/root` ni de otros bots.
- `CLAUDE_FLAGS=--permission-mode acceptEdits` deja editar archivos sin preguntar
  pero **no** corre comandos arbitrarios sin confirmación. Para autonomía total
  (correr tests, git, etc. sin preguntar) usá `--dangerously-skip-permissions`,
  entendiendo que el bot podrá ejecutar cualquier cosa dentro del alcance de su usuario.
- El `.env` tiene el token: no lo commitees (ya está en `.gitignore`).
- Secretos con privilegios altos (tokens de Supabase Management API, etc.) que
  vivan en el `.env` de un bot quedan expuestos si *ese* bot se compromete —
  no asumas que "está en un `.env`" alcanza; el aislamiento por usuario es la
  segunda capa, no la única.

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
