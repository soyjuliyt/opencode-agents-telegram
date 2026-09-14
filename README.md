# OpenCode Telegram Group Topics Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-539%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)]()

**Languages:** English (`en`), Deutsch (`de`), Español (`es`), Français (`fr`), Русский (`ru`), [简体中文 (`zh-CN`)](./README.zh-CN.md)

> **One Telegram supergroup. Every project. Every session. All in parallel — with zero collisions.**

A Telegram bot for [OpenCode](https://opencode.ai) that turns a single supergroup into a **mission control** for your whole machine. Spawn one topic per project, run them all at the same time, and never worry about contexts bleeding into each other.

Fork of [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot), rebuilt around **Telegram forum topics**, **per-thread state**, and **multi-project concurrency**.

---

## The Power-Up 💪

This isn't "one chat attached to one repo". It's a full control surface for parallel development:

| Capability | What it means for you |
|---|---|
| 🧵 **Topic = isolated session** | Each topic owns its own OpenCode session. No shared context, no interference. |
| 🗂 **Every project, one group** | `/projects` lists **all** repositories on the machine — not just one "family". |
| ⚡ **True parallelism** | Topic A works on backend, Topic B on frontend, Topic C on infra — simultaneously. |
| 🚦 **Zero collisions** | Interactive flows (menus, permissions, questions) are guarded **per scope** (`chatId:threadId`). Two topics never fight over the same input. |
| 💾 **SQLite persistence** | Projects, sessions, models, agents, pinned messages survive reboots, updates, crashes. |
| 🎛 **Fine-grained per-topic control** | Model, agent, variant, and context limit are stored per topic — change one without touching the rest. |
| 🔓 **Auto-permissions** | Tell a thread to "allow all" and the bot silently handles every prompt — or "deny all" for read-only spectators. |
| 🧠 **Smart model picker** | Favorites first, then browse by **provider**, then per-provider models — paginated, never a wall of text. |

---

## Multi-Project Without Collisions

The design handles concurrency at three layers so nothing ever clashes:

```
📱 One Telegram Supergroup (Topics enabled) — many threads, many sessions, one machine
```

**1. Scope-isolated state.** Every thread is its own scope key `chatId:threadId`. It stores its own selected project, session, model, agent, variant, and context limit in SQLite. Switching a project in the General topic never leaks into a session topic, and vice versa.

**2. One lane per session.** Each session topic binds to exactly one OpenCode session. SSE events from that session are routed back to **its own topic** — subagent cards, tool calls, final responses stay where they belong.

**3. Guarded interactions.** Only one blocking interaction (inline menu, permission popup, question, rename) can be active **per scope**. Thread A can be mid-menu while Thread B answers a permission — they run independently. The "busy session" queue is also per-session, so a long run in one project never blocks another project's topic.

> Run 5 supergroups against the same machine if you want. Each group = a different team, focus, or set of permissions.

---

## Model Management, Rethought 🧠

Picking a model used to mean scrolling a giant flat list. Now it's a clean browse flow:

```
1. Bottom keyboard → Model button
2. ⭐ Favorites + 🕘 Recent (one tap to switch)
3. 🗂 Providers → a paginated list of providers
4. Model list for that provider → paginated, tap to select, done
```

- Favorites/recent are read from OpenCode's own state, deduplicated, and validated against the catalog.
- The current model is always highlighted with a ✅ and remembered **per topic**.
- `/model` from any thread opens the same providers-first browser.
- No wall of text: both providers and models paginate automatically (`COMMANDS_LIST_LIMIT`).

---

## Permission Automation 🔓

New in this fork — `/permission` gives every thread its own permission policy:

| Mode | Behavior |
|---|---|
| ❓ **Ask each time** (default) | The classic inline prompt: Allow / Always / Reject |
| 🔓 **Allow all automatically** | Every Bash/Edit/Write/catalog request is auto-approved instantly |
| ⛔ **Deny all automatically** | Everything is auto-rejected — read-only mode |

Mode changes apply **per thread** (the scope key again), persist in SQLite, and the menu closes as soon as you pick one. No confirmation-popup fatigue when you trust a long-running task; full manual control when you don't.

---

## Why a Database Matters (SQLite)

Not in-memory state that vanishes on restart — **better-sqlite3** under the hood:

| What's persisted | Why it matters |
|------------------|----------------|
| Selected project per scope (General + each topic) | Reopen the group → you're exactly where you left off |
| Session ↔ topic bindings | Topics never lose their session, even across bot/server restarts |
| Model/agent/variant per topic | Your coding preferences stick where you put them |
| Permission mode per scope | Trust settings survive everything |
| Pinned message IDs | Status messages update in place, no spam |
| `/tts` toggle, service message visibility | UI preferences persist |
| Scheduled tasks & topic mappings | Cron jobs run on time, results land in the right topic |
| Migration from legacy `settings.json` | Zero-friction upgrades |

**Result:** stop the bot, update code, restart — every topic resumes exactly as it was.

---

## Quick Start

### Prerequisites
- Nothing to install by hand on Linux/macOS: the bootstrap installs **Node.js 20+** and **OpenCode** natively when missing.
- Windows needs PowerShell 5.1+ (the bootstrap also installs Node via winget and OpenCode via npm).
- Telegram bot token from [@BotFather](https://t.me/BotFather)

> Your Telegram User ID is **not** required anymore: the first person who DMs the bot `/start` becomes the admin automatically.

### 1. Create the Supergroup
1. New **Supergroup** in Telegram
2. Enable **Topics** (Settings → Topics)
3. Add bot, make it **Admin** with **Manage Topics** permission
4. In @BotFather: `/setprivacy` → **Disable**
5. Keep **General** topic — it's your control center

### 2. Start OpenCode
```bash
opencode serve
# Default: http://localhost:4096
```
> The universal deploy (**Step 5**) starts `opencode serve` for you and registers
> it with logon autostart, secured with the password set in `OPENCODE_SERVER_PASSWORD`.
> Run it manually only if you disabled that (e.g. `--no-opencode`).

### 3. Run the Bot

**Option A: NPX (zero install)**
```bash
npx opencode-telegram-group-topics-bot
```

**Option B: Global install**
```bash
npm install -g opencode-telegram-group-topics-bot
opencode-telegram-group-topics-bot config
opencode-telegram-group-topics-bot start

# Windows: run hidden in the background (daemon). Manage with `status` / `stop`.
opencode-telegram-group-topics-bot start --daemon
```

**Option C: From source**
```bash
git clone https://github.com/soyjuliyt/opencode-agents-telegram.git
cd opencode-agents-telegram
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

### 4. Setup Wizard
The CLI walks you through the **language** and your **bot token** only. Everything else gets sensible defaults; the OpenCode server URL, model and credentials can be changed later in `.env` or via setup flags.

### 5. Verify
1. DM the bot → `/start` → you are adopted as admin instantly (ownership is saved to `.env`)
2. In group **General** → `/start` → `/status` (OpenCode should show healthy)
3. `/projects` → pick a repo
4. `/new` → creates a session topic
5. Enter the topic → send a prompt → watch it work

### Deploy on any machine (one-shot)

Windows, Linux or macOS, **no Docker, native install**. The one-liner installs
Node.js 20+ **and OpenCode** when missing, fetches this repo and runs the
universal setup: writes `.env` (token only — the rest is wizard or flags),
builds, starts the bot **hidden in the background** and installs logon autostart
(Startup VBS / systemd / launchd) by default.

```powershell
# Windows
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1 --token 123456:ABC --user-id 123456
```

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/soyjuliyt/opencode-agents-telegram/main/scripts/bootstrap.sh | bash -s -- --token 123456:ABC --user-id 123456
```

Already have Node and the repo? Just `npm run deploy` (or
`node scripts/setup.mjs`). Full details: [docs/DEPLOY.md](./docs/DEPLOY.md).

---

## Daily Workflow (Mobile-First)

```
🌅 Morning
├── Open Telegram group
├── General: /status → confirm server alive
├── General: /projects → switch to "backend-api"
├── General: /new → "Add rate limiting to auth"
└── Work in the new topic from phone or desktop

🌙 Evening
├── General: /new → "frontend-dashboard" → "Refactor chart component"
├── General: /new → "infra-terraform" → "Plan new RDS instance"
├── Topic: /permission → 🔓 Allow all automatically
└── All three topics running in parallel while you're away
```

**No laptop required.** OpenCode runs on your machine. You drive it from Telegram.

---

## Commands Reference

| Command | Scope | Purpose |
|---------|-------|---------|
| `/status` | Any | Global health: server, project, session, model, context |
| `/new` | General | Create session topic bound to current project |
| `/abort` | Session topic | Stop current task (ESC equivalent) |
| `/sessions` | General | Browse/switch recent sessions across ALL projects |
| `/projects` | General | List & switch ALL OpenCode projects on machine |
| `/model` | Any | Browse model catalog: favorites → providers → models (paginated) |
| `/permission` | Any | Per-thread policy: ask / allow all / deny all |
| `/language` | Any | Switch bot language instantly (EN · DE · ES · FR · RU · ZH) |
| `/tts` | General | Toggle global audio replies (persists in SQLite) |
| `/rename` | Session topic | Rename current session |
| `/commands` | Session topic | Browse/run custom OpenCode commands |
| `/task` | General | Create scheduled task for current project |
| `/tasklist` | General | List/delete scheduled tasks |
| `/opencode_start` | General | Start OpenCode server remotely |
| `/opencode_stop` | General | Stop OpenCode server remotely |
| `/help` | Any | Show commands |

**Text messages** in session topics = prompts (when no blocking interaction).
**Voice/audio** = transcribed via a Whisper-compatible API (if configured).
**Files (images, PDFs, code files)** = uploaded to OpenCode automatically.

---

## Configuration Highlights

### Config Locations
| Mode | Path |
|------|------|
| Source (dev) | Repo root `.env` |
| Installed (global) | Platform app-data dir |
| Override | `OPENCODE_TELEGRAM_HOME` env var |

### Key Environment Variables
```env
# Required
TELEGRAM_BOT_TOKEN=xxx
OPENCODE_MODEL_PROVIDER=opencode
OPENCODE_MODEL_ID=big-pickle

# Optional — auto-captured from the first /start DM if omitted
TELEGRAM_ALLOWED_USER_ID=

# Optional but powerful
OPENCODE_API_URL=http://localhost:4096
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=secret  # auto-generated by the deploy if left empty

# Database & persistence (SQLite, auto-managed — no config needed)

# Multi-project behavior
PROJECTS_LIST_LIMIT=20          # Projects per page
SESSIONS_LIST_LIMIT=20          # Sessions per page
COMMANDS_LIST_LIMIT=10          # Rows per model provider/commands page

# Telegram rate-limit friendly
SERVICE_MESSAGES_INTERVAL_SEC=5 # Batch updates (>=2 recommended)
RESPONSE_STREAM_THROTTLE_MS=1000

# Optional: Voice → Text (STT)
STT_API_URL=https://api.groq.com/openai/v1
STT_API_KEY=gsk_xxx
STT_MODEL=whisper-large-v3-turbo

# Optional: Text → Voice (TTS) — toggle with /tts
TTS_API_URL=https://api.openai.com/v1
TTS_API_KEY=sk-xxx
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=alloy
```

Full list in the [Configuration Reference](#configuration-reference-full) below.

---

## Architecture Snapshot

```
┌─────────────────────────────────────────────────────────────┐
│                    Telegram Supergroup                       │
│  General (control)  │  Topic A  │  Topic B  │  Scheduled    │
└─────────┬───────────┴─────┬─────┴─────┬─────┴──────┬────────┘
          │                 │           │            │
          ▼                 ▼           ▼            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Bot Process                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Grammy Bot  │  │ State Mgmt   │  │ SQLite Persistence │  │
│  │ (commands,  │  │ (per scope:  │  │ (sessions, topics, │  │
│  │  middleware)│  │  chatId:     │  │  models, agents,   │  │
│  └──────┬──────┘  │  threadId)   │  │  permissions, ...) │  │
│         │         └──────┬───────┘  └────────┬───────────┘  │
│         │                │                    │              │
│         ▼                ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              OpenCode Client (SDK)                   │   │
│  │  SSE Events → Aggregator → Formatter → Telegram     │   │
│  └─────────────────────────┬────────────────────────────┘   │
└────────────────────────────┼────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  OpenCode Server (local)                     │
│  Projects: backend-api  │  frontend-dashboard  │  infra...   │
└─────────────────────────────────────────────────────────────┘
```

**Zero public exposure.** Bot ↔ OpenCode (localhost) + Bot ↔ Telegram Bot API only.

---

## Features at a Glance

- 🧵 **Thread-scoped sessions** — one topic = one OpenCode session, fully isolated
- 🗄️ **SQLite persistence** — state survives restarts, updates, crashes
- 🌐 **Multi-project by default** — `/projects` shows everything on the machine
- ⚡ **Parallel execution** — multiple topics, multiple groups, all simultaneous
- 🚦 **Collision-proof** — per-scope interactions, per-session queues, no cross-thread bleed
- 🧠 **Modern model browser** — favorites → providers → per-provider models, paginated
- 🔓 **Auto-permissions** — `/permission` with ask / allow-all / deny-all per thread
- 📌 **Pinned live status** — session title, project, model, context %, changed files, cost
- 🎯 **Subagent cards** — child sessions stream back as live status cards in parent topic
- 🎤 **Voice → Text (STT)** — Whisper-compatible (OpenAI, Groq, Together, etc.)
- 🔊 **Text → Voice (TTS)** — global toggle via `/tts`, OpenAI-compatible
- 📎 **File uploads** — images, PDFs, code files sent to OpenCode automatically
- 🔐 **Single-user security** — `TELEGRAM_ALLOWED_USER_ID` enforced everywhere
- 🌍 **7 languages** — EN, DE, ES, FR, RU, ZH, switchable live via `/language`
- ⚙️ **Model/agent/variant/context** — controlled from persistent bottom keyboard
- ⏰ **Scheduled tasks** — cron-style prompts per project, results in dedicated topics
- 🛑 **Interaction guard** — one active flow at a time per scope
- 📊 **Rate-limit aware** — batches Telegram updates, never loses OpenCode work

---

## How This Differs From Upstream

| Aspect | Upstream (grinev) | This Fork |
|--------|-------------------|-----------|
| UX | Single chat | **Forum topics = parallel lanes** |
| Project scope | One repo per bot | **ALL projects in one group** |
| Session model | Switch in-place | **One topic per session** |
| Persistence | JSON file | **SQLite (better-sqlite3)** |
| Multi-group | Not designed for it | **Multiple groups supported** |
| Permissions | Always interactive | **Per-scope auto allow/deny** |
| Model picker | Flat list | **Favorites → providers → models** |
| Scheduled tasks | ❌ | ✅ Per-project, dedicated topics |
| Target | Simplicity | **Mobile parallel workflows** |

If you want simple single-chat → use upstream.  
If you want **one group to rule them all** → this fork.

---

## Configuration Reference (Full)

<details>
<summary><b>Click to expand all environment variables</b></summary>

| Variable | Description | Required | Default |
|----------|-------------|:--------:|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | Yes | — |
| `TELEGRAM_ALLOWED_USER_ID` | Your numeric Telegram user ID (auto-detected on first `/start` DM if empty) | No | `0` (onboarding) |
| `TELEGRAM_PROXY_URL` | Proxy for Telegram API (SOCKS5/HTTP) | No | — |
| `OPENCODE_API_URL` | OpenCode server URL | No | `http://localhost:4096` |
| `OPENCODE_SERVER_USERNAME` | Server auth username | No | `opencode` |
| `OPENCODE_SERVER_PASSWORD` | Server auth password (auto-generated if empty) | No | auto-generated |
| `OPENCODE_MODEL_PROVIDER` | Default model provider | Yes | `opencode` |
| `OPENCODE_MODEL_ID` | Default model ID | Yes | `big-pickle` |
| `BOT_LOCALE` | UI language (`en`, `de`, `es`, `fr`, `ru`, `zh`) | No | `en` |
| `SESSIONS_LIST_LIMIT` | Sessions per page in `/sessions` | No | `10` |
| `PROJECTS_LIST_LIMIT` | Projects per page in `/projects` | No | `10` |
| `COMMANDS_LIST_LIMIT` | Rows per page (commands, model providers/models) | No | `10` |
| `SCHEDULED_TASK_POLL_INTERVAL_SEC` | Scheduled task poll interval | No | `30` |
| `SERVICE_MESSAGES_INTERVAL_SEC` | Batch service messages (>=2 for rate limits, 0 = immediate) | No | `5` |
| `HIDE_THINKING_MESSAGES` | Hide "Thinking..." messages | No | `false` |
| `HIDE_TOOL_CALL_MESSAGES` | Hide tool-call messages | No | `false` |
| `HIDE_TOOL_FILE_MESSAGES` | Hide tool-file messages | No | `false` |
| `MESSAGE_FORMAT_MODE` | `markdown` or `raw` | No | `markdown` |
| `RESPONSE_STREAM_THROTTLE_MS` | Delay between streamed updates (ms) | No | `1000` |
| `BASH_TOOL_DISPLAY_MAX_LENGTH` | Max length for bash commands in summaries | No | `128` |
| `CODE_FILE_MAX_SIZE_KB` | Max file size (KB) to send as document | No | `100` |
| `STT_API_URL` | Whisper-compatible API base URL | No | — |
| `STT_API_KEY` | STT API key | No | — |
| `STT_MODEL` | STT model name | No | `whisper-large-v3-turbo` |
| `STT_LANGUAGE` | Optional language hint | No | — |
| `STT_NOTE_PROMPT` | Optional prompt for STT | No | — |
| `TTS_API_URL` | TTS API base URL | No | — |
| `TTS_API_KEY` | TTS API key | No | — |
| `TTS_MODEL` | TTS model name | No | `gpt-4o-mini-tts` |
| `TTS_VOICE` | TTS voice name | No | `alloy` |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | No | `info` |

</details>

---

## Development

```bash
git clone https://github.com/soyjuliyt/opencode-agents-telegram.git
cd opencode-agents-telegram
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

### Scripts
| Script | Description |
|--------|-------------|
| `npm run dev` | Build + start |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled |
| `npm run lint` | ESLint (zero warnings) |
| `npm run format` | Prettier |
| `npm test` | Vitest (539 tests) |
| `npm run test:coverage` | Coverage report |
| `npm run deploy` | Universal one-shot deploy (wizard/flags, build, hidden start, autostart) |
| `npm run autostart:install` | Windows: arrancar con tu sesión + iniciar ya (no root) |
| `npm run autostart:uninstall` | Windows: sacar del arranque con Windows |

### Windows autostart

El bot puede instalarse como **servicio de usuario que arranca solo al iniciar sesión en Windows** (`npm run autostart:install`). Usa el daemon nativo oculto (`node dist/cli.js start --daemon`): sin ventanas, log propio en `logs/bot-service-*.log` y estado en `run/bot-service.json`. El instalador coloca un lanzador oculto en la carpeta de inicio, espera 30 s y evita duplicados. Para gestionarlo: `node dist/cli.js status` / `node dist/cli.js stop`. Detalles y pasos manuales: [docs/WINDOWS_AUTOSTART.md](./docs/WINDOWS_AUTOSTART.md).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Bot silent | Check `TELEGRAM_ALLOWED_USER_ID` matches your ID; disable privacy mode in BotFather |
| OpenCode unreachable | Run `opencode serve`; verify `OPENCODE_API_URL` |
| Can't create topics | Group must be supergroup + Topics enabled + bot admin with Manage Topics |
| Messages queue with "busy session" | A previous run is stuck server-side — `POST /session/<id>/abort` on the OpenCode API clears it |
| No models in picker | Add favorites in OpenCode TUI (`Ctrl+F`); verify provider/model env vars |
| Linux exec permission | `chmod +x $(which opencode-telegram-group-topics-bot)` |

---

## Security Model

- **Single-user:** Only `TELEGRAM_ALLOWED_USER_ID` can interact
- **Per-scope permissions:** `/permission` gate per thread — allow, ask, or deny automatically
- **Local-only:** Bot ↔ OpenCode on localhost; no public ports
- **Telegram only:** All external communication via Bot API (HTTPS)
- **No secrets in logs:** Structured logging, configurable levels

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).  
Fork issues here; upstream discussion at [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot).

---

## License

[MIT](LICENSE) • Original © Ruslan Grinev • Fork changes © Shane Kunz