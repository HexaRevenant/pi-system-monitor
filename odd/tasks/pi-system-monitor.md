# pi-system-monitor — gentle-shell port of opencode-monitor

A Pi extension that renders live system metrics, git state, clock, and provider quotas as its own card in the gentle-shell fullscreen rail, directly below the Status card.

## Specs

- **S1** — Parity with OpenCode: the user asked that it "funcione como funciona en opencode" (`L3`). The card refreshes live, keeps the same sections and formatting language as the OpenCode sidebar panel, and stays visible without a command.
- **S2** — Separate project: "crear otro proyecto en github personal mismo nombre pero con otro nombre" (`L4`). New repository `HexaRevenant/pi-system-monitor` (public), MIT, same author. `opencode-monitor` is only a source of reusable modules; it is never modified.
- **S3** — Placement: "en ese lugar deberia ir" (`L2`), pointing at the Status card, and the chosen option "Tarjeta propia debajo de Status (experimental)". The card is appended to the `footer` rail part of gentile-shell's fullscreen sidebar, directly below the Status card, through `Symbol.for("gentle-pi.experimental-sidebar.state")`.
- **S4** — Content: "Sistema: CPU, RAM, GPU, VRAM, temperatura, red", "Git: rama, ahead/behind y cambios", "Reloj y fecha", "Cuotas Codex / OpenCode Go" (`L5`).
- **S5** — Pi auth, not OpenCode auth: quotas read `<agentDir>/auth.json` (`PI_CODING_AGENT_DIR` or `~/.pi/agent`). Codex is gated on provider `openai-codex`; the ChatGPT account id comes from the access-token JWT claim `https://api.openai.com/auth` → `chatgpt_account_id`. OpenCode Go is gated on provider `opencode-go` and reads that provider's stored key.
- **S6** — Graceful absence: when the rail part or the sidebar internals are missing, the extension renders nothing and never throws into the host render path. When a metric or credential is unavailable, its line says so without hiding the rest.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Scaffold the repo: package.json, tsconfig, LICENSE, .gitignore, index.ts | S2 | inline | d096ab9 |
| T2 | Copy and adapt reusable core modules plus their tests | S1, S4 | inline | d096ab9 |
| T3 | Write the Pi auth adapter and provider gating | S5 | inline | 6009806 |
| T4 | Write the panel model and the pure card renderer | S1, S3, S4 | inline | 6009806 |
| T5 | Write the rail injection with digest, restore, and defensive failure | S3, S6 | inline | 22357ec |
| T6 | Wire the extension: lifecycle, timers, `/monitor` toggle | S1, S6 | inline | 22357ec |
| T7 | Test the new logic and run the full suite and typecheck | S1–S6 | inline | 0dbbd0e |
| T8 | Write README (EN/ES), compatibility note, install/uninstall scripts | S2, S3 | inline | 0dbbd0e |
| T9 | Publish the public repository and verify the first push | S2 | inline | published |

## Log

- **L1** — "quiero integrar opencode monitor a i gentle-shell"
- **L2** — "[Image#1] en ese lugar deberia ir" (screenshot of gentle-shell's Status card)
- **L3** — Answer 1: "que funcione como funciona en opencode"
- **L4** — Answer 3: "crear otro proyecto en github personal mismo nombre pero con otro nombre"
- **L5** — Answer 2, selections: "Sistema: CPU, RAM, GPU, VRAM, temperatura, red", "Git: rama, ahead/behind y cambios", "Reloj y fecha", "Cuotas Codex / OpenCode Go"
- **L6** — Second questionnaire: name "pi-system-monitor", placement "Tarjeta propia debajo de Status (experimental)", repository "Público".
- **L7** — Evidence: commits `d096ab9`, `6009806`, `22357ec`, `0dbbd0e`; 102 tests pass; `tsc --noEmit` clean; jiti 2.7.0 loads `index.ts` with a function default export. Published at https://github.com/HexaRevenant/pi-system-monitor (public, default branch `main`).
- **L8** — Installation into the live gentle-shell home is pending explicit authorization to write `/home/hexa/.gentle-shell/agent/extensions/pi-system-monitor`.
