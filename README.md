# pi-system-monitor

Live sidebar card for **Gentle Shell** (gentle-pi / Pi): system metrics, git state, clock, and Codex / OpenCode Go quotas, painted directly below the Status card.

This is the Gentle Shell port of [`opencode-monitor`](https://github.com/HexaRevenant/opencode-monitor). It reuses that project's framework-agnostic core (MIT, same author) and replaces the OpenCode/opentui renderer with a Pi extension that paints into the Gentle Shell rail.

## What it shows

- **Clock**: local time and date, refreshed every second.
- **System**: CPU use and temperature, RAM used/total, GPU use and temperature, GPU VRAM used/total, and download/upload rates. Sampled every 2 seconds; GPU and temperature sources use the same short-lived cache as the OpenCode monitor.
- **Git**: current branch, ahead/behind, changed-file count, up to three changed paths, and the hidden remainder. Read from `git status` in the session directory every 2 seconds.
- **Collapsible sections**: the Sistema, Git, and Uso headings collapse to a one-line summary when you click them in the fullscreen rail, or through `/monitor toggle <section>`.
- **Codex usage**: session and weekly windows, plus the credit balance when it is present. Shown only while the active Pi provider is `openai-codex`; refreshed every five minutes.
- **OpenCode Go usage**: rolling 5-hour, weekly, and monthly remaining percentages with their status. Shown only while the active Pi provider is `opencode-go`; refreshed every five minutes.

Unavailable values render as `—` (or `unavailable` in a quota section). A missing credential never hides the rest of the card.

## Where the card is painted

Gentle Shell's fullscreen rail paints four fixed sections in a fixed order: `todo`, `jobs`, `agents`, and `footer` (the Status card). A third-party extension cannot register a new section, so this extension **wraps the first existing slot (`agents`) and prepends its card**, which puts it above AGENTS and above every later section. The wrapper forwards every other host member of that part (`summary`, `open`, `alert`, `spend`) and declares its own `cardGroups()` entry, so a transparent rail draws our card as its own card instead of splicing it into the wrapped one. The wrapper reads the process-wide state at `Symbol.for("gentle-pi.experimental-sidebar.state")` and never imports Gentle Shell internals.

A transparent-chrome rail asks the part for its card groups and paints each group itself, so there the card renders frameless rows and its first row becomes the card header — the same treatment CHANGES and INTEGRATIONS get. A rail that never asks for card groups is painting nothing for us, so the card falls back to drawing its own frame from Gentle Shell's active card style (`Symbol.for("gentle-pi.card-style")`): `neon` a rounded outline, `float` a square-cornered box. The extension only relies on that observed call, never on host internals.

Click the `↻` next to the Sistema/System heading to cycle four densities: `comfortable` (one metric per row with byte totals and a dated clock), `compact` (two metrics per row with gauges, summaries inline), `dense` (two per row, no gauges, totals kept) and `summary` (one line per section). The folded views put the system-local date and a 24-hour clock in the card header, in the field order the locale defines. Clicking the rest of the heading still folds the section.

**Compatibility note.** The rail wrapper is experimental by definition. It is written defensively: when the state symbol, the `footer` part, or a render callback is missing or throws, the original Status card is returned untouched and the monitor stays inert. The card is only painted in the fullscreen rail (Gentle Shell's default breakpoint is 140 columns); regular mode has no rail to paint into.

## Requirements

- Gentle Shell with gentle-pi 4.5.1 / Pi 1.4.0 (tested), or a compatible Pi 1.x.
- Node.js 18 or newer.
- `git` on `PATH` for the Git section (optional).
- Credentials are optional: Codex needs an `openai-codex` OAuth entry, OpenCode Go needs an `opencode-go` entry in Pi's `auth.json`.

## Install

### Install from npm

```bash
pi install npm:pi-system-monitor@0.1.0
```

For an isolated gentle-shell home, point Pi at that home:

```bash
PI_CODING_AGENT_DIR=~/.gentle-shell/agent pi install npm:pi-system-monitor@0.1.0
```

Then restart gentle-shell, or run `/reload` inside it. Pi installs the package dependencies and supplies `@earendil-works/pi-tui`.

### Install from a checkout

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

Install into every agent home your sessions actually load. A plain Pi session reads `~/.pi/agent/extensions`; gentle-shell defaults to `~/.gentle-shell/agent`. Run the script once per home, for example `npm run install-extension -- --agent-home ~/.pi/agent --yes`.

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
| `/monitor toggle <metrics\|git\|usage>` | Collapse or expand one section. |
| `/monitor collapse <section>` | Collapse one section. |
| `/monitor expand <section>` | Expand one section. |
| `/monitor collapse all` | Collapse every section. |
| `/monitor expand all` | Expand every section. |

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
- **Secciones colapsables**: los encabezados Sistema, Git y Uso se colapsan a una línea de resumen al hacer clic en el rail de pantalla completa, o con `/monitor toggle <sección>`.
- **Uso de Codex**: ventanas de sesión y semanal, más el saldo de créditos cuando existe. Solo aparece si el proveedor activo de Pi es `openai-codex`; se actualiza cada cinco minutos.
- **Uso de OpenCode Go**: porcentajes restantes de las ventanas móvil de 5 horas, semanal y mensual, con su estado. Solo aparece si el proveedor activo es `opencode-go`; se actualiza cada cinco minutos.

Los valores no disponibles se muestran como `—` (o `no disponible` en una sección de cuota). Que falte una credencial nunca oculta el resto de la tarjeta.

### Dónde se pinta

El rail de pantalla completa de Gentle Shell pinta cuatro secciones fijas en un orden fijo: `todo`, `jobs`, `agents` y `footer` (la tarjeta Status). Una extensión de terceros no puede registrar una sección nueva, así que esta extensión **envuelve el primer slot existente (`agents`) y antepone su tarjeta**, lo que la deja arriba de AGENTS y de todas las secciones posteriores. El envoltorio reenvía el resto de miembros del host de esa parte (`summary`, `open`, `alert`, `spend`) y declara su propio `cardGroups()`, para que un rail transparente dibuje nuestra tarjeta como tarjeta propia en vez de incrustarla en la que envuelve. El envoltorio lee el estado de proceso en `Symbol.for("gentle-pi.experimental-sidebar.state")` y nunca importa internals de Gentle Shell.

Un rail de chrome transparente le pide a la parte sus grupos de tarjeta y pinta cada grupo él mismo, así que ahí la tarjeta devuelve filas sin marco y su primera fila pasa a ser el encabezado, el mismo trato que reciben CHANGES e INTEGRATIONS. Un rail que nunca pide grupos de tarjeta no está pintando nada por nosotros, así que la tarjeta vuelve a dibujar su propio marco según el estilo activo de Gentle Shell (`Symbol.for("gentle-pi.card-style")`): `neon` un contorno redondeado y `float` una caja de esquinas rectas. La extensión se apoya solo en esa llamada observada, nunca en internals del host.

Un clic en el `↻` junto al encabezado Sistema recorre cuatro densidades: `comfortable` (una métrica por fila con totales en bytes y la fecha), `compact` (dos métricas por fila con gauge y los resúmenes en línea), `dense` (dos por fila, sin gauges, con totales) y `summary` (una línea por sección). Las vistas plegadas muestran en el encabezado la fecha local del sistema y la hora en formato 24 h, con el orden de campos que define el locale. Un clic en el resto del encabezado sigue plegando la sección.

**Nota de compatibilidad.** El envoltorio del rail es experimental por definición. Está escrito de forma defensiva: si falta el símbolo de estado, la parte `footer` o un callback de render, o si alguno lanza un error, se devuelve la tarjeta Status original intacta y el monitor queda inerte. La tarjeta solo se pinta en el rail de pantalla completa (el punto de corte por defecto de Gentle Shell es 140 columnas); el modo regular no tiene rail.

### Requisitos

- Gentle Shell con gentle-pi 4.5.1 / Pi 1.4.0 (probado), o un Pi 1.x compatible.
- Node.js 18 o superior.
- `git` en `PATH` para la sección Git (opcional).
- Credenciales opcionales: Codex necesita una entrada OAuth `openai-codex` y OpenCode Go una entrada `opencode-go` en el `auth.json` de Pi.

### Instalación

#### Instalación desde npm

```bash
pi install npm:pi-system-monitor@0.1.0
```

Para un home aislado de gentle-shell, apunta Pi a ese home:

```bash
PI_CODING_AGENT_DIR=~/.gentle-shell/agent pi install npm:pi-system-monitor@0.1.0
```

Luego reinicia gentle-shell o ejecuta `/reload` dentro. Pi instala las dependencias y provee `@earendil-works/pi-tui`.

#### Instalación desde un checkout

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

Instala en cada agent home que tus sesiones carguen de verdad. Una sesión de Pi normal lee `~/.pi/agent/extensions`; gentle-shell usa `~/.gentle-shell/agent` por defecto. Ejecuta el script una vez por home, por ejemplo `npm run install-extension -- --agent-home ~/.pi/agent --yes`.

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
| `/monitor toggle <metrics\|git\|usage>` | Colapsa o expande una sección. |
| `/monitor collapse <sección>` | Colapsa una sección. |
| `/monitor expand <sección>` | Expande una sección. |
| `/monitor collapse all` | Colapsa todas las secciones. |
| `/monitor expand all` | Expande todas las secciones. |

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

---

## Português

Cartão lateral ao vivo para **Gentle Shell** (gentle-pi / Pi): métricas do sistema, estado do git, relógio e cotas do Codex / OpenCode Go, pintado logo abaixo do cartão Status.

Este é o port para Gentle Shell do [`opencode-monitor`](https://github.com/HexaRevenant/opencode-monitor). Reutiliza o núcleo independente de render daquele projeto (MIT, mesmo autor) e substitui o renderizador OpenCode/opentui por uma extensão do Pi que pinta no rail do Gentle Shell.

### O que mostra

- **Relógio**: hora e data locais, atualizadas a cada segundo.
- **Sistema**: uso e temperatura da CPU, RAM usada/total, uso e temperatura da GPU, VRAM usada/total e velocidades de download/upload. Amostradas a cada 2 segundos; GPU e temperatura usam o mesmo cache curto do monitor do OpenCode.
- **Git**: branch atual, ahead/behind, quantidade de arquivos alterados, até três caminhos e o restante resumido. Lido com `git status` no diretório da sessão a cada 2 segundos.
- **Seções recolhíveis**: os títulos Sistema, Git e Uso recolhem para uma linha de resumo com clique no rail de tela cheia, ou com `/monitor toggle <seção>`.
- **Uso do Codex**: janelas de sessão e semanal, mais o saldo de créditos quando existe. Só aparece quando o provedor ativo do Pi é `openai-codex`; atualizado a cada cinco minutos.
- **Uso do OpenCode Go**: percentuais restantes das janelas móvel de 5 horas, semanal e mensal, com seu status. Só aparece quando o provedor ativo é `opencode-go`; atualizado a cada cinco minutos.

Valores indisponíveis aparecem como `—` (ou `indisponível` numa seção de cota). A ausência de uma credencial nunca esconde o resto do cartão.

### Onde o cartão é pintado

O rail de tela cheia do Gentle Shell pinta quatro seções fixas em ordem fixa: `todo`, `jobs`, `agents` e `footer` (o cartão Status). Uma extensão de terceiros não pode registrar uma seção nova, então esta extensão **envolve o primeiro slot existente (`agents`) e antepõe seu cartão**, o que o deixa acima de AGENTS e de todas as seções posteriores. O wrapper reenvia os demais membros do host dessa parte (`summary`, `open`, `alert`, `spend`) e declara seu próprio `cardGroups()`, para que um rail transparente desenhe nosso cartão como cartão próprio em vez de embuti-lo no que envolve. O wrapper lê o estado de processo em `Symbol.for("gentle-pi.experimental-sidebar.state")` e nunca importa internals do Gentle Shell.

Um rail de chrome transparente pede à parte seus grupos de cartão e pinta cada grupo ele mesmo, então ali o cartão devolve linhas sem moldura e sua primeira linha vira o cabeçalho, o mesmo tratamento de CHANGES e INTEGRATIONS. Um rail que nunca pede grupos de cartão não está pintando nada por nós, então o cartão volta a desenhar sua própria moldura conforme o estilo ativo do Gentle Shell (`Symbol.for("gentle-pi.card-style")`): `neon` um contorno arredondado e `float` uma caixa de cantos retos. A extensão depende apenas dessa chamada observada, nunca de internals do host.

Um clique no `↻` ao lado do cabeçalho Sistema percorre quatro densidades: `comfortable` (uma métrica por linha com totais em bytes e a data), `compact` (duas métricas por linha com gauge e os resumos em linha), `dense` (duas por linha, sem gauges, com totais) e `summary` (uma linha por seção). As visões dobradas mostram no cabeçalho a data local do sistema e a hora em formato 24 h, na ordem de campos que o locale define. Um clique no resto do cabeçalho continua dobrando a seção.

**Nota de compatibilidade.** O wrapper do rail é experimental por definição. É escrito de forma defensiva: se faltar o símbolo de estado, a parte `footer` ou um callback de render, ou se algum lançar erro, o cartão Status original é devolvido intacto e o monitor fica inerte. O cartão só é pintado no rail de tela cheia (o ponto de corte padrão do Gentle Shell é 140 colunas); o modo regular não tem rail.

### Requisitos

- Gentle Shell com gentle-pi 4.5.1 / Pi 1.4.0 (testado), ou um Pi 1.x compatível.
- Node.js 18 ou superior.
- `git` no `PATH` para a seção Git (opcional).
- Credenciais opcionais: Codex precisa de uma entrada OAuth `openai-codex` e OpenCode Go de uma entrada `opencode-go` no `auth.json` do Pi.

### Instalação

#### Instalação via npm

```bash
pi install npm:pi-system-monitor@0.1.0
```

Para um home isolado do gentle-shell:

```bash
PI_CODING_AGENT_DIR=~/.gentle-shell/agent pi install npm:pi-system-monitor@0.1.0
```

Depois reinicie o gentle-shell ou execute `/reload`. O Pi instala as dependências e fornece `@earendil-works/pi-tui`.

#### Instalação a partir de um checkout

```bash
npm install
npm run install-extension -- --dry-run
npm run install-extension -- --yes
```

`install-extension` cria um único symlink, `<agent-home>/extensions/pi-system-monitor`, apontando para este checkout. Nunca apaga um diretório real e se recusa a substituir um link de outro checkout salvo com `--force`.

`<agent-home>` resolve nesta ordem:

1. `--agent-home <path>`
2. `GENTLE_SHELL_HOME`
3. `PI_CODING_AGENT_DIR`
4. `~/.gentle-shell/agent`

Instale em cada agent home que suas sessões carregam de verdade. Uma sessão normal do Pi lê `~/.pi/agent/extensions`; o gentle-shell usa `~/.gentle-shell/agent` por padrão. Execute o script uma vez por home, por exemplo `npm run install-extension -- --agent-home ~/.pi/agent --yes`.

Reinicie o gentle-shell, ou execute `/reload` dentro, depois de instalar ou atualizar.

#### Desinstalação

```bash
npm run uninstall-extension -- --dry-run
npm run uninstall-extension -- --yes
```

Só é removido um symlink que resolva para este checkout.

### Comandos

| Comando | Efeito |
| --- | --- |
| `/monitor` | Mostra ou oculta o cartão. |
| `/monitor on` | Mostra o cartão. |
| `/monitor off` | Oculta o cartão. |
| `/monitor refresh` | Atualiza métricas, git e cotas imediatamente. |
| `/monitor toggle <metrics\|git\|usage>` | Recolhe ou expande uma seção. |
| `/monitor collapse <seção>` | Recolhe uma seção. |
| `/monitor expand <seção>` | Expande uma seção. |
| `/monitor collapse all` | Recolhe todas as seções. |
| `/monitor expand all` | Expande todas as seções. |

### Configuração

| Variável | Efeito |
| --- | --- |
| `GENTLE_SHELL_HOME` | Agent home usado pelos scripts de instalação e desinstalação. |
| `PI_CODING_AGENT_DIR` | Agent home do Pi; também é onde se lê `auth.json`. |
| `OPENCODE_MONITOR_NERD_FONT=1` | Usa ícones Nerd Font no Windows. Linux e macOS só os usam se houver uma Nerd Font instalada. |

### Privacidade

- `auth.json` é lido localmente e apenas para o provedor ativo. As credenciais nunca são armazenadas, registradas ou escritas.
- O painel do Codex envia o token OAuth e o account id do ChatGPT, ambos derivados da credencial guardada, para `https://chatgpt.com/backend-api/wham/usage`.
- O painel do OpenCode Go envia sua chave de API apenas para `https://opencode.ai/zen/go/v1/usage`. Esse endpoint é observado, não uma API estável documentada.
- As métricas do sistema vêm de `systeminformation` e dos contadores de plataforma que o `opencode-monitor` já usa; nenhuma telemetria é enviada.

### Desenvolvimento

```bash
npm test
npm run typecheck
```

A suíte cobre o renderizador puro, o adaptador de credenciais do Pi, o wrapper do rail, o poller de cotas e os módulos de núcleo reutilizados. O Pi carrega os fontes TypeScript diretamente com jiti, então não há passo de build para uso local.

### Licença

MIT. Ver [LICENSE](LICENSE).
