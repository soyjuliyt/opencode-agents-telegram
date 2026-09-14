# Deploy (cualquier máquina)

Despliegue universal del bot en una máquina cualquiera (Windows, Linux o macOS).
**Sin Docker, sin contenedores, sin entornos cerrados**: instalación nativa y
directa con permisos completos, arranque oculto en segundo plano y autostart
con el inicio de sesión habilitados por defecto.

El bot es el **cliente**; necesita el **OpenCode server** alcanzable en
`OPENCODE_API_URL` (por defecto `http://localhost:4096`, levantado con
`opencode serve`). Si OpenCode no está instalado, el propio deploy lo instala
nativamente (binario oficial en Linux/macOS, `npm i -g opencode-ai` en Windows).

## Una sola línea (bootstrap)

No hace falta tener Node, git ni OpenCode instalado: el propio bootstrap los
resuelve.

**Windows** (PowerShell):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\bootstrap.ps1"
```

O con flags para no hacer el wizard:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bootstrap.ps1 --token 123456:ABC
```

**Linux / macOS** (bash):

```bash
curl -fsSL https://raw.githubusercontent.com/soyjuliyt/opencode-agents-telegram/main/scripts/bootstrap.sh | bash
```

Con flags:

```bash
curl -fsSL https://raw.githubusercontent.com/soyjuliyt/opencode-agents-telegram/main/scripts/bootstrap.sh | bash -s -- --token 123456:ABC
```

El bootstrap:

1. instala Node.js 20+ nativamente (Windows: winget; Debian/Ubuntu: NodeSource;
   Arch: pacman; Fedora: dnf; macOS: Homebrew);
2. instala **OpenCode** si falta (script oficial en Linux/macOS, npm en Windows);
3. clona el repo (o baja el zip si no hay git) a `~/opencode-telegram-group-topics-bot`;
4. ejecuta el setup universal.

## Setup universal (ya con Node / ya clonado)

```bash
node scripts/setup.mjs            # asistente interactivo: idioma + token
# o con flags (silencioso):
node scripts/setup.mjs --token 123456:ABC
```

Flags: `--token`, `--user-id` (opcional), `--provider` (default `opencode`),
`--model` (default `big-pickle`), `--api-url` (default `http://localhost:4096`),
`--server-user` (default `opencode`), `--server-password`, `--locale`,
`--no-opencode`, `--no-start`, `--no-autostart`, `--no-build`, `--yes`,
`--dry-run`, `--help`.

Qué hace (en orden):

1. comprueba/instala **OpenCode** (si falta y no se pasó `--no-opencode`);
2. escribe `.env` (fusionando lo que ya exista — solo el token es obligatorio);
3. `npm install` (solo si falta `node_modules`) y `npm run build`;
4. arranca el bot oculto en segundo plano;
5. instala el autostart con el login, según plataforma:
   - **Windows**: daemon nativo (`dist/cli.js start --daemon`, oculto con
     `windowsHide`) lanzado por un `.vbs` en la carpeta *Inicio*;
   - **Linux**: servicio user de systemd (`~/.config/systemd/user/...service`)
     que ejecuta `dist/index.js` en primer plano gestionado por systemd;
   - **macOS**: agente launchd (`~/Library/LaunchAgents/...plist`) con
     `KeepAlive` y `ThrottleInterval` para evitar bucles de reinicio.

> El user ID del admin **no se pide**: la primera persona que escriba al bot
> por privado con `/start` queda registrada como dueño en `.env`
> automáticamente.

## Gestión

| Sistema | Estado | Detener | Autostart off |
|---|---|---|---|
| Windows | `node dist/cli.js status` | `node dist/cli.js stop` | `npm run autostart:uninstall` |
| Linux | `systemctl --user status opencode-telegram-group-topics-bot` | `systemctl --user stop ...` | `systemctl --user disable ...` |
| macOS | `launchctl print gui/$(id -u)/com.opencode-telegram.group-topics-bot` | `launchctl bootout gui/$(id -u)/...` | quitar el plist de `~/Library/LaunchAgents` |

Los logs del bot van a `<repo>/logs/` (`bot-service-*.log` en Windows,
`bot-autostart.log` en todos; en Linux el journal de systemd también los captura).

## Checklist del día uno

1. Correr el bootstrap/setup y dar el **token** de @BotFather (lo único que se pide).
2. Escribirle al bot por privado con `/start`: quedás registrado como admin.
3. Crear el grupo en Telegram con **Topics** habilitado, agregar el bot como admin
   con permiso **Manage Topics** y (en @BotFather) `/setprivacy` → **Disable**.
4. `opencode serve` corriendo (o accesible) en `OPENCODE_API_URL` (el deploy instala OpenCode; también hay `/opencode_start`).
5. Probar: en General `/status` (server healthy) → `/projects` → `/new`.