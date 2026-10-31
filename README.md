# pi-system-monitor

Live sidebar card for **Gentle Shell** (gentle-pi / Pi): system metrics, git state, clock, and Codex / OpenCode Go quotas, painted directly below the Status card.

This is the Gentle Shell port of [`opencode-monitor`](https://github.com/HexaRevenant/opencode-monitor). It reuses that project's framework-agnostic core (MIT, same author) and replaces the OpenCode/opentui renderer with a Pi extension that paints into the Gentle Shell rail.

## What it shows

- **Clock**: local time and date, refreshed every second.
- **System**: CPU use and temperature, RAM used/total, GPU use and temperature, GPU VRAM used/total, and download/upload rates. Sampled every 2 seconds; GPU and temperature sources use the same short-lived cache as the OpenCode monitor.
- **Git**: current branch, ahead/behind, changed-file count, up to three changed paths, and the hidden remainder. Read from `git status` in the session directory every 2 seconds.
- **Codex usage**: session and weekly windows, plus the credit balance when it is present. Shown only while the active Pi provider is `openai-codex`; refreshed every five minutes.
- **OpenCode Go usage**: rolling 5-hour, weekly, and monthly remaining percentages with their status. Shown only while the active Pi provider is `opencode-go`; refreshed every five minutes.

Unavailable values render as `—` (or `unavailable` in a quota section). A missing credential never hides the rest of the card.

## Where the card is painted

Gentle Shell's fullscreen rail renders four fixed sections: `footer` (the Status card), `jobs`, `agents`, and `todo`. A third-party extension cannot register a new section, so this extension **wraps the existing `footer` rail part** and appends its own card after the Status card. The wrapper reads the process-wide state at `Symbol.for("gentle-pi.experimental-sidebar.state")` and never imports Gentle Shell internals.

The card follows Gentle Shell's active card style (`neon` outline or `float` left bar), read from `Symbol.for("gentle-pi.card-style")`.

**Compatibility note.** The rail wrapper is experimental by definition. It is written defensively: when the state symbol, the `footer` part, or a render callback is missing or throws, the original Status card is returned untouched and the monitor stays inert. The card is only painted in the fullscreen rail (Gentle Shell's default breakpoint is 140 columns); regular mode has no rail to paint into.

## Requirements

- Gentle Shell with gentle-pi 4.5.1 / Pi 1.4.0 (tested), or a compatible Pi 1.x.
- Node.js 18 or newer.
- `git` on `PATH` for the Git section (optional).
- Credentials are optional: Codex needs an `openai-codex` OAuth entry, OpenCode Go needs an `opencode-go` entry in Pi's `auth.json`.

## Install

```bash
npm install
npm run install-extension -- --dry-run
npm run install-extension -- --yes
```

`install-extension` creates one symlink, `<agent-home>/extensions/pi-system-monitor`, pointing at this checkout. It never deletes a real directory and refuses to replace a link owned by another checkout unless you pass `--force`.

`<agent-home>` resolves in this order:

1. `--agent-home <path>`
2. `GENTLE_SHELL_HOME`
3. `PI_CODING_AGENT_DIR`
4. `~/.gentle-shell/agent`

Restart gentle-shell, or run `/reload` inside it, after installing or updating.

### Uninstall

```bash
npm run uninstall-extension -- --dry-run
npm run uninstall-extension -- --yes
```

Only a symlink that resolves to this checkout is removed.

## Commands

| Command | Effect |
| --- | --- |
| `/monitor` | Toggle the card on or off. |
| `/monitor on` | Show the card. |
| `/monitor off` | Hide the card. |
| `/monitor refresh` | Refresh metrics, git, and quotas immediately. |

## Configuration

| Variable | Effect |
| --- | --- |
| `GENTLE_SHELL_HOME` | Agent home used by the install and uninstall scripts. |
| `PI_CODING_AGENT_DIR` | Pi agent home; also where the extension reads `auth.json`. |
| `OPENCODE_MONITOR_NERD_FONT=1` | Use Nerd Font icons on Windows. Linux and macOS use them only when a Nerd Font is installed. |

## Privacy

- `auth.json` is read locally and only for the active provider. Credentials are never stored, logged, or written.
- The Codex panel sends the OAuth access token and the ChatGPT account id, both derived from the stored credential, to `https://chatgpt.com/backend-api/wham/usage`.
- The OpenCode Go panel sends its API key only to `https://opencode.ai/zen/go/v1/usage`. That endpoint is observed, not a documented stable API.
- System metrics come from `systeminformation` and the platform counters already used by `opencode-monitor`; no telemetry is sent.

## Development

```bash
npm test
npm run typecheck
```

The test suite covers the pure renderer, the Pi credential adapter, the rail wrapper, the quota poller, and the reused core modules. TypeScript sources are loaded directly by Pi's jiti loader, so there is no build step for local use.

## License

MIT. See [LICENSE](LICENSE).

---

## Español

Tarjeta lateral en vivo para **Gentle Shell** (gentle-pi / Pi): métricas del sistema, estado de git, reloj y cuotas de Codex / OpenCode Go, pintada justo debajo de la tarjeta Status.

Es el port a Gentle Shell de [`opencode-monitor`](https://github.com/HexaRevenant/opencode-monitor). Reutiliza el núcleo independiente del render de ese proyecto (MIT, mismo autor) y sustituye el renderizador de OpenCode/opentui por una extensión de Pi que pinta en el rail de Gentle Shell.

### Qué muestra

- **Reloj**: hora y fecha locales, actualizadas cada segundo.
- **Sistema**: uso y temperatura de CPU, RAM usada/total, uso y temperatura de GPU, VRAM usada/total y velocidades de descarga/subida. Se muestrean cada 2 segundos; GPU y temperatura usan la misma caché breve que el monitor de OpenCode.
- **Git**: rama actual, ahead/behind, cantidad de archivos modificados, hasta tres rutas y el resto resumido. Se lee con `git status` en el directorio de la sesión cada 2 segundos.
- **Uso de Codex**: ventanas de sesión y semanal, más el saldo de créditos cuando existe. Solo aparece si el proveedor activo de Pi es `openai-codex`; se actualiza cada cinco minutos.
- **Uso de OpenCode Go**: porcentajes restantes de las ventanas móvil de 5 horas, semanal y mensual, con su estado. Solo aparece si el proveedor activo es `opencode-go`; se actualiza cada cinco minutos.

Los valores no disponibles se muestran como `—` (o `no disponible` en una sección de cuota). Que falte una credencial nunca oculta el resto de la tarjeta.

### Dónde se pinta

El rail de pantalla completa de Gentle Shell renderiza cuatro secciones fijas: `footer` (la tarjeta Status), `jobs`, `agents` y `todo`. Una extensión de terceros no puede registrar una sección nueva, así que esta extensión **envuelve la parte `footer` existente** y añade su tarjeta después de Status. El envoltorio lee el estado de proceso en `Symbol.for("gentle-pi.experimental-sidebar.state")` y nunca importa internals de Gentle Shell.

La tarjeta sigue el estilo activo de Gentle Shell (`neon` con marco o `float` con barra izquierda), leído de `Symbol.for("gentle-pi.card-style")`.

**Nota de compatibilidad.** El envoltorio del rail es experimental por definición. Está escrito de forma defensiva: si falta el símbolo de estado, la parte `footer` o un callback de render, o si alguno lanza un error, se devuelve la tarjeta Status original intacta y el monitor queda inerte. La tarjeta solo se pinta en el rail de pantalla completa (el punto de corte por defecto de Gentle Shell es 140 columnas); el modo regular no tiene rail.

### Requisitos

- Gentle Shell con gentle-pi 4.5.1 / Pi 1.4.0 (probado), o un Pi 1.x compatible.
- Node.js 18 o superior.
- `git` en `PATH` para la sección Git (opcional).
- Credenciales opcionales: Codex necesita una entrada OAuth `openai-codex` y OpenCode Go una entrada `opencode-go` en el `auth.json` de Pi.

### Instalación

```bash
npm install
npm run install-extension -- --dry-run
npm run install-extension -- --yes
```

`install-extension` crea un único symlink, `<agent-home>/extensions/pi-system-monitor`, que apunta a este checkout. Nunca borra un directorio real y se niega a reemplazar un enlace de otro checkout salvo con `--force`.

`<agent-home>` se resuelve en este orden:

1. `--agent-home <path>`
2. `GENTLE_SHELL_HOME`
3. `PI_CODING_AGENT_DIR`
4. `~/.gentle-shell/agent`

Reinicia gentle-shell, o ejecuta `/reload` dentro, después de instalar o actualizar.

### Desinstalación

```bash
npm run uninstall-extension -- --dry-run
npm run uninstall-extension -- --yes
```

Solo se elimina un symlink que resuelva a este checkout.

### Comandos

| Comando | Efecto |
| --- | --- |
| `/monitor` | Muestra u oculta la tarjeta. |
| `/monitor on` | Muestra la tarjeta. |
| `/monitor off` | Oculta la tarjeta. |
| `/monitor refresh` | Refresca métricas, git y cuotas de inmediato. |

### Configuración

| Variable | Efecto |
| --- | --- |
| `GENTLE_SHELL_HOME` | Agent home que usan los scripts de instalación y desinstalación. |
| `PI_CODING_AGENT_DIR` | Agent home de Pi; también es donde se lee `auth.json`. |
| `OPENCODE_MONITOR_NERD_FONT=1` | Usa iconos Nerd Font en Windows. Linux y macOS solo los usan si hay una Nerd Font instalada. |

### Privacidad

- `auth.json` se lee localmente y solo para el proveedor activo. Las credenciales nunca se almacenan, registran ni escriben.
- El panel de Codex envía el token OAuth y el account id de ChatGPT, ambos derivados de la credencial guardada, a `https://chatgpt.com/backend-api/wham/usage`.
- El panel de OpenCode Go envía su clave API solo a `https://opencode.ai/zen/go/v1/usage`. Ese endpoint es observado, no una API estable documentada.
- Las métricas del sistema vienen de `systeminformation` y de los contadores de plataforma que ya usa `opencode-monitor`; no se envía telemetría.

### Desarrollo

```bash
npm test
npm run typecheck
```

La suite cubre el renderizador puro, el adaptador de credenciales de Pi, el envoltorio del rail, el poller de cuotas y los módulos de núcleo reutilizados. Pi carga los fuentes TypeScript directamente con jiti, así que no hay paso de build para uso local.

### Licencia

MIT. Ver [LICENSE](LICENSE).
