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
Procesa una tarea por vez. Comandos: `/start`, `/help`, `/pwd`.
