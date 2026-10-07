# Trabajar con el journal desde otro ordenador (Mac) · 07-10-2026

El código vive en GitHub (`eduardolny94/journal`) y los datos reales en producción (Railway). Cualquier ordenador
puede clonar el repo y trabajar. Lo único que no viaja por git son las claves locales, la base de datos local, los
certificados subidos y la memoria de Claude: eso va en el **paquete** `journal-mac-paquete-<fecha>.zip`
(se genera en el PC de Windows; su `LEEME.txt` dice dónde va cada cosa).

## 1. Programas en el Mac (una sola vez)

1. **Git**: en Terminal, `xcode-select --install` (instala las herramientas de línea de comandos de Apple, incluye git).
2. **Node 24**: descarga el instalador `.pkg` de [nodejs.org](https://nodejs.org) (versión LTS, 22.13 o superior sirve).
   Alternativa con Homebrew: `brew install node git`.
3. **Claude Desktop** (claude.ai/download) con la misma cuenta.
4. Cuenta de GitHub lista para clonar un repo privado: al hacer `git clone` el Mac abre el navegador para iniciar sesión
   (Git Credential Manager) o, si se prefiere, `brew install gh && gh auth login`.

## 2. Clonar y arrancar

```bash
cd ~/Desktop && git clone https://github.com/eduardolny94/journal.git && cd journal && npm install
```

Descomprime el paquete y copia su contenido sobre la carpeta `journal` tal como indica `LEEME.txt`:

| Del paquete | Al proyecto |
|---|---|
| `.env` | raíz del proyecto (junto a `package.json`) |
| `server/data/journal.db` | `server/data/journal.db` |
| `server/uploads/` | `server/uploads/` |
| `.claude/` | `.claude/` en la raíz |
| `memoria-claude/` | `~/.claude/projects/<carpeta-del-proyecto>/memory/` (Claude en el Mac sabe hacerlo) |

Arranca en modo desarrollo (API en 3200 y cliente en 5173, con recarga automática):

```bash
npm run dev
```

y abre `http://localhost:5173`. Usuario demo: `demo@journal.com` / `demo1234`.
Para una sola ventana, como el servicio local de Windows: `npm run build && npm start` y abrir `http://localhost:3200`.

Sin paquete también funciona: `cp .env.example .env`, poner un `JWT_SECRET` largo y `npm run seed` crea los datos de demo.

## 3. Claude Code en el Mac

Abre Claude Desktop → pestaña Code → elige la carpeta `journal`. Esa sesión es nueva (las sesiones no se sincronizan
entre ordenadores), pero con `docs/` y la memoria copiada se pone al día. Primer mensaje recomendado:

> Este es mi journal de trading (Global Traders FX). Lee `docs/ARQUITECTURA.md`, `docs/DEPLOY.md`, `docs/RADAR.md`,
> `docs/FINANZAS.md` y la memoria de proyecto, comprueba que `npm run dev` arranca y que `npm test` pasa, y dime
> en qué estado está todo. No hagas push sin avisarme.

## 4. Trabajar desde los dos ordenadores sin pisarse

- Antes de empezar en cualquiera de los dos: `git pull`. Al terminar: commit y `git push`.
  Cada push a `main` despliega producción en Railway (unos 3 minutos).
- La base de datos local y las subidas **no se sincronizan** entre ordenadores: son datos de prueba. Los datos de
  verdad (usuarios, operaciones, certificados) están en producción y se ven igual desde cualquier sitio en
  `https://journal.cesarzorrilla.com`.
- El `.env` del Mac lleva `MT5_FILES_DIR` vacío: el radar usa precios de Yahoo. El feed de MetaTrader 5 solo
  existe en el ordenador donde corre MT5 con el servicio RadarPrecios (ver `docs/SYNC-MT5.md`).
- El servicio local automático (tarea programada «GTFX Journal») es solo de Windows. En el Mac se arranca a mano
  con `npm run dev` o `npm start`.
- Para seguir **esta misma conversación** de Claude desde el Mac o el móvil: activar «Control remoto» en la sesión
  del PC de Windows y abrirla en claude.ai/code. Requiere que el PC esté encendido con la app abierta.

## 5. Regenerar el paquete (en el PC de Windows)

Claude lo genera con un script que copia el `.env` (con `MT5_FILES_DIR` vacío), una copia consistente de
`server/data/journal.db` (`VACUUM INTO`, válida aunque el servicio esté corriendo), `server/uploads/`, `.claude/` y
la memoria de Claude, y lo deja como `journal-mac-paquete-<fecha>.zip` en el Escritorio. El paquete contiene claves:
bórralo de Descargas del Mac cuando termines de copiarlo.
