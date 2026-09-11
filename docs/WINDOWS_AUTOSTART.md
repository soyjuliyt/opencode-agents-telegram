# Windows autorun (arranque con Windows)

Convierte al bot en un **servicio de usuario que arranca solo al iniciar sesión en Windows**, oculto y en segundo plano, sin necesidad de abrir una consola. No requiere permisos de administrador.

## Cómo arranca el bot en modo oculto

El proyecto tiene un **daemon nativo**: `node dist/cli.js start --daemon`. Ese es el comando por defecto para ejecutar el bot oculto:

- spawns el bot como proceso separado con `windowsHide` + `detached` (sin ventanas, sin consola);
- escribe su propio log en `logs/bot-service-<timestamp>.log`;
- guarda su estado (PID, log, hora de arranque) en `run/bot-service.json` (ambas carpetas ignoradas por git);
- se gestiona con:

```powershell
# estado del servicio (PID, uptime, log)
node dist/cli.js status

# detener el daemon
node dist/cli.js stop
```

> El daemon usa `OPENCODE_TELEGRAM_HOME` para resolver dónde están `.env`, `settings.sqlite`, `logs/` y `run/`. El autostart fija esa variable a la raíz del repo, así el daemon trabaja siempre sobre la configuración del repo (no sobre la carpeta `%APPDATA%` del modo instalado).

## Qué hace el instalador

`scripts/install-windows-autostart.ps1` coloca un pequeño lanzador VBS en la carpeta *Inicio* de tu usuario:

- espera 30 segundos tras el inicio de sesión (para que red y servidor OpenCode estén listos);
- verifica con WMI que el bot **no esté ya corriendo** (evita duplicados, acepta `dist/cli.js` y `dist/index.js`);
- lanza `node dist\cli.js start --daemon` (modo oculto nativo), fijando `OPENCODE_TELEGRAM_HOME` al repo y descartando cualquier `OPENCODE_SERVER_PASSWORD` ambiental para que valga la del `.env`;
- redirige la salida del comando CLI a `logs/bot-autostart.log` (el daemon, además, escribe `logs/bot-service-<timestamp>.log`).

El patrón es el mismo que ya usás para otros servicios (OpenCode Server, Gateways, etc.): un `.vbs` en la carpeta de inicio.

## Instalar

Prerrequisitos:

1. Node.js 20+ en el `PATH` (o el runtime de Hermes en `%LOCALAPPDATA%\hermes`).
2. `npm install` y `npm run build` ya hechos.
3. `.env` configurado en la raíz del repo (ver `.env.example`). **No se commitean secretos**: el instalador nunca toca `.env`.
4. El servidor OpenCode alcanzable desde `OPENCODE_API_URL` (si el server escucha en una IP/red distinta al `localhost:4096` por defecto, setear `OPENCODE_API_URL` y `OPENCODE_SERVER_PASSWORD` en `.env`). Suele tener su propio autostart (`opencode serve`).

Luego:

```powershell
npm run autostart:install
```

Instala el autostart **y además** deja el bot corriendo ya mismo en segundo plano.

## Desinstalar

```powershell
npm run autostart:uninstall
```

Esto solo quita el lanzador de la carpeta de Inicio. Para detener el daemon que ya esté corriendo:

```powershell
node dist/cli.js stop
```

## Uso a mano / verificación

```powershell
# estado del servicio (PID, uptime, log)
node dist/cli.js status

# procesos del bot
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*dist/cli.js*" -or $_.CommandLine -like "*dist/index.js*" }

# log del arranque automático y del daemon
Get-Content logs/bot-autostart.log -Tail 50
Get-Content logs/bot-service-*.log -Tail 50
```

Si el bot no contesta, revisar `logs/bot-autostart.log`, `logs/bot-service-*.log`, y confirmar que el server de OpenCode esté escuchando en `OPENCODE_API_URL`.

## Notas

- El lanzador se crea en `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\opencode-telegram-bot-start.vbs`. Podés abrirlo y revisarlo.
- Se genera para el **usuario actual** (no es un servicio de Windows global); es lo correcto para una máquina de un solo usuario.
- Para volver a arrancar el daemon a mano tras un `stop`: `node dist/cli.js start --daemon` (con `OPENCODE_TELEGRAM_HOME` apuntando al repo si no lo tenés seteado).
- Los secretos (`TELEGRAM_BOT_TOKEN`, credenciales del server) viven solo en `.env`; el instalador no los lee ni los copia.