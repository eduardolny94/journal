# Formatear el PC sin perder nada · guía de respaldo y restauración (02-10-2026)

Qué está a salvo sin hacer nada, qué vive solo en este PC y cómo volver a dejarlo todo igual. Está pensada para que
Claude la siga paso a paso cuando el usuario diga **"vuelvo, acabo de formatear"**.

## Lo que ya está a salvo (no depende del PC)

| Qué | Dónde vive |
|---|---|
| Código del journal, radar, scripts, docs, indicador de TradingView, extensión, servicio MT5 | GitHub `eduardolny94/journal` (rama `main`) |
| Producción (base de datos de los usuarios, radar, suscripciones) | Railway, volumen `/app/server/data` + variables de entorno |
| Otros proyectos con remoto en GitHub | ver la tabla de proyectos más abajo |

## Lo que vive SOLO en este PC (hay que respaldarlo)

| Qué | Ruta | Por qué importa |
|---|---|---|
| Proyectos de `Desktop\claude` sin remoto o con cambios sin subir | `C:\Users\lucci\Desktop\claude\*` | código que no está en GitHub |
| Claves locales del journal | `trading-journal\.env` (raíz) | FRED_API_KEY, INVITE_CODE y demás; no están en git |
| Velas H1 de MT5 (10 pares, 5 años) y resultados de backtests | `trading-journal\data\mt5\*.csv` (ignorados por git) | re-exportar desde MT5 lleva una tarde |
| Base de datos local (demo, radar local, calendario histórico) | `trading-journal\server\data\journal.db` | se puede regenerar, pero el calendario de 3 años tarda horas |
| Skill de metodología del radar y launch.json | `trading-journal\.claude\` (ignorada por git) | reglas de la casa para Claude |
| **Memoria de Claude** (contexto de todos los proyectos) | `C:\Users\lucci\.claude\projects\C--Users-lucci-Desktop-claude\memory\` | sin esto Claude empieza de cero |
| Skills y ajustes de Claude Code | `C:\Users\lucci\.claude\skills\`, `settings.json`, `keybindings.json`, `plugins\` | la skill `watch`, superpowers, etc. |
| Sesiones de Claude (transcripciones) | `C:\Users\lucci\.claude\projects\*.jsonl` | historial de conversaciones (opcional) |
| Identidad de git y credenciales de GitHub | `~\.gitconfig`, `~\.git-credentials`, `~\.ssh\` | si no, volver a iniciar sesión en GitHub |
| MetaTrader 5: código MQL5 y ajustes | `%APPDATA%\MetaQuotes\Terminal\<id>\MQL5\{Services,Scripts,Experts}` y `config` | GTFX_JournalSync, RadarPrecios, ExportarHistorial (también están en el repo) |
| Tarea programada del servidor local | `GTFX Journal` (Programador de tareas) | arranca el journal local al iniciar sesión |

Lo que NO hace falta copiar: `node_modules`, `dist`, cachés, programas (se reinstalan).

## Antes de formatear (5 minutos)

1. Conecta un USB o disco externo (o abre OneDrive/Google Drive) y ejecuta en PowerShell, desde la carpeta del proyecto:
   ```powershell
   .\scripts\respaldo-pc.ps1 -Destino "E:\"
   ```
   Crea `E:\RESPALDO-CLAUDE-<fecha>` con todo lo de la tabla anterior (sin node_modules). Comprueba que la carpeta existe
   y pesa decenas de MB, no cero.
2. Apunta aparte las contraseñas que no están en ningún archivo: cuenta de GitHub, Railway, Resend, logins de las
   cuentas de MetaTrader (prop firms), TradingView, Plus500, Google (Gemini) y la del propio journal
   (`eduardolny94@gmail.com`).
3. Comprueba en GitHub que el último commit del journal es el que ves en local (`git log -1`).

## Después de formatear (lo hace Claude con el usuario)

Orden de instalación, con los comandos exactos:

1. **Programas base** (PowerShell como administrador):
   ```powershell
   winget install Git.Git
   winget install OpenJS.NodeJS.LTS
   winget install Python.Python.3.12
   winget install Gyan.FFmpeg
   winget install yt-dlp.yt-dlp
   winget install Google.Chrome
   ```
   Claude Desktop (claude.ai/download) y MetaTrader 5 (desde la web del bróker: Goat Funded, Equity Edge, FT Trading demo).
2. **Restaurar la memoria y las skills de Claude** desde el respaldo: copiar `claude-home\projects\C--Users-lucci-Desktop-claude\memory`
   a `C:\Users\lucci\.claude\projects\C--Users-lucci-Desktop-claude\memory`, `claude-home\skills` a `C:\Users\lucci\.claude\skills`,
   y `settings.json` / `keybindings.json`. Abrir Claude Desktop e iniciar sesión.
3. **Git y GitHub**: copiar `.gitconfig` (o `git config --global user.name/email`); al primer `git push` el gestor de
   credenciales pedirá iniciar sesión en GitHub.
4. **Proyectos**: `git clone https://github.com/eduardolny94/journal.git "C:\Users\lucci\Desktop\claude\trading-journal"`
   y lo mismo para cada proyecto con remoto; los que no tienen remoto se copian del respaldo (`Desktop-claude\<proyecto>`).
5. **Journal en local**: copiar del respaldo `.env`, `data\mt5\`, `server\data\journal.db` y `.claude\` dentro de
   `trading-journal`; luego `npm install` en `server` y en `client`, `npm run smoke` para comprobar, y volver a crear
   la tarea programada: `Register-ScheduledTask -Xml (Get-Content GTFX-Journal-tarea.xml -Raw) -TaskName 'GTFX Journal'`
   (o `scripts\servicio.ps1` a mano).
6. **MetaTrader 5**: iniciar sesión en cada cuenta, copiar del respaldo las carpetas `MQL5\Services` y `MQL5\Scripts`
   (o descargar GTFX_JournalSync del journal), añadir el servicio con el token (Cuentas → Conectar), permitir WebRequest
   a `https://journal.cesarzorrilla.com`.
7. **Extensión de TradingView**: descargar el ZIP desde el journal, cargar descomprimida en Chrome y pegar el token.
8. **Skill watch**: `python "C:\Users\lucci\.claude\skills\watch\scripts\setup.py" --json` y elegir motor (Gemini con clave
   de aistudio.google.com, o local).
9. Comprobar: `git log -1` coincide con GitHub, el journal local responde en `http://127.0.0.1:3200/api/health`, el
   radar carga, Claude recuerda los proyectos (memoria) y la skill `radar-metodologia` aparece.

## Qué decirle a Claude al volver

> "Vuelvo, acabo de formatear. El respaldo está en E:\RESPALDO-CLAUDE-2026-10-02. Sigue docs/RESTAURAR-PC.md."

Si el respaldo no está a mano, lo mínimo para seguir trabajando es: clonar el repo, restaurar la memoria de Claude y
el `.env`; lo demás se regenera.
