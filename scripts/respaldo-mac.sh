#!/bin/zsh
# Respaldo completo del journal en el Mac (15-11-2026). Crea una carpeta con TODO lo que no está en GitHub ni en Railway:
# claves, memoria y reglas de Claude, base de datos local, trabajo sin subir, programas de MetaTrader y una copia completa
# del código con su historial. No depende de la cuenta de Claude ni de la de GitHub.
#   zsh scripts/respaldo-mac.sh                    → ~/Respaldos/RESPALDO-JOURNAL-<fecha>
#   zsh scripts/respaldo-mac.sh /Volumes/MiDisco   → en un disco externo
#   zsh scripts/respaldo-mac.sh --con-datos        → añade las velas exportadas (3 GB) y las conversaciones de Claude
# OJO: la carpeta contiene claves (archivo .env, tokens). Guárdala en un disco tuyo; no la subas a sitios compartidos.
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"; DATOS=0; DEST="$HOME/Respaldos"
for a in "$@"; do if [ "$a" = "--con-datos" ]; then DATOS=1; else DEST="$a"; fi; done
OUT="$DEST/RESPALDO-JOURNAL-$(date +%Y-%m-%d)"; mkdir -p "$OUT" || { echo "No puedo crear $OUT"; exit 1; }
CL="$HOME/.claude"; PROY="$CL/projects/-Users-cesarzorrilla-Desktop-journal"
MT="$HOME/Library/Application Support/net.metaquotes.wine.metatrader5/drive_c"
copia() { [ -e "$1" ] && mkdir -p "$2" && cp -R "$1" "$2/" 2>/dev/null && echo "  ok  $3"; }
echo "Respaldo en $OUT"
# 1) Código completo con historial (se restaura con: git clone journal.bundle journal)
( cd "$REPO" && git bundle create "$OUT/journal.bundle" --all >/dev/null 2>&1 ) && echo "  ok  código con todo su historial (journal.bundle)"
( cd "$REPO" && git status --short > "$OUT/cambios-sin-subir.txt"; git log --oneline -5 > "$OUT/ultimos-commits.txt" )
# 2) Lo que no está en git
copia "$REPO/.env" "$OUT/privado" "claves del journal (.env)"
mkdir -p "$OUT/claude-proyecto" && cp -R "$REPO/.claude/skills" "$REPO/.claude/launch.json" "$OUT/claude-proyecto/" 2>/dev/null && echo "  ok  reglas de la casa (skill del radar) y launch.json"
copia "$REPO/server/data" "$OUT/local" "base de datos local"
for d in marketing mesa-agentes docs/img; do copia "$REPO/$d" "$OUT/sin-subir/$(dirname $d)" "trabajo sin subir: $d"; done
mkdir -p "$OUT/datos" && for d in historico yahoo mt5 mt5-fxcm cme-perfil cme-ohlcv eurusd-quant; do [ -d "$REPO/data/$d" ] && cp -R "$REPO/data/$d" "$OUT/datos/" 2>/dev/null; done; echo "  ok  datos de mercado pequeños (historico, yahoo, mt5…)"
# 3) Claude: memoria (lo que hace que Claude recuerde el proyecto), ajustes y plugins
copia "$PROY/memory" "$OUT/claude-memoria" "memoria de Claude ($(ls "$PROY/memory" 2>/dev/null | wc -l | tr -d ' ') notas)"
copia "$CL/settings.json" "$OUT/claude-ajustes" "ajustes de Claude"
[ -d "$CL/plugins" ] && tar -czf "$OUT/claude-ajustes/plugins.tgz" -C "$CL" plugins 2>/dev/null && echo "  ok  plugins de Claude"
# 4) Otras claves y lanzadores de este Mac
copia "$HOME/.config/gtfx" "$OUT/privado/config" "configuración GTFX (Discord)"
copia "$HOME/.config/watch" "$OUT/privado/config" "configuración del visor de vídeos"
copia "$HOME/.local/bin/mt5-b" "$OUT/mac" "lanzador del segundo MetaTrader"
copia "$HOME/.gitconfig" "$OUT/mac" "identidad de git"
# 5) MetaTrader: programas GTFX y archivos comunes (token del journal, Discord)
for T in "MetaTrader 5" "MetaTrader 5 B"; do for S in Experts Scripts Services; do D="$MT/Program Files/$T/MQL5/$S"; [ -d "$D" ] && mkdir -p "$OUT/metatrader/$T/$S" && cp "$D"/GTFX_* "$OUT/metatrader/$T/$S/" 2>/dev/null; done; done; echo "  ok  programas GTFX de MetaTrader"
C="$MT/users/user/AppData/Roaming/MetaQuotes/Terminal/Common/Files"; mkdir -p "$OUT/privado/metatrader-comun" && cp "$C"/GTFX_token.txt "$C"/GTFX_discord.txt "$MT/gtfx_export.ini" "$OUT/privado/metatrader-comun/" 2>/dev/null; echo "  ok  token y ajustes comunes de MetaTrader"
# 6) Opcional: velas exportadas (3 GB) y conversaciones
if [ $DATOS = 1 ]; then cp -R "$REPO/data/mt5-largo" "$OUT/datos/" && echo "  ok  velas exportadas de MetaTrader (grande)"; mkdir -p "$OUT/claude-conversaciones" && cp "$PROY"/*.jsonl "$OUT/claude-conversaciones/" 2>/dev/null && echo "  ok  conversaciones de Claude"; fi
cat > "$OUT/LEEME.txt" <<TXT
RESPALDO DEL JOURNAL · $(date +%Y-%m-%d)

Qué hay:
  journal.bundle        todo el código con su historial        →  git clone journal.bundle journal
  privado/              CLAVES (.env, tokens). No compartir.
  claude-memoria/       lo que Claude recuerda del proyecto     →  ~/.claude/projects/-Users-<usuario>-Desktop-journal/memory/
  claude-proyecto/      reglas del radar y launch.json          →  journal/.claude/
  local/, datos/        base de datos local y datos de mercado  →  journal/server/data y journal/data
  sin-subir/            marketing, salidas de la mesa, imágenes
  metatrader/           programas GTFX                          →  MQL5/Experts, Scripts y Services de cada MetaTrader
  mac/                  lanzador mt5-b y .gitconfig

Qué NO hay aquí (vive en internet, con tus cuentas):
  · La web y los datos de tus usuarios: Railway. Copia de la base de datos: entra como dueño en
    https://journal.cesarzorrilla.com/api/admin/backup y guarda el archivo.
  · El código también está en GitHub: github.com/eduardolny94/journal
  · Indicadores de TradingView: en tu cuenta de TradingView.

Para seguir con otra cuenta de Claude, en este Mac o en otro: instala Claude, pon las carpetas en su sitio (arriba),
abre la carpeta journal y dile: «lee docs/RESTAURAR-PC.md y la memoria; vuelvo de un respaldo».
TXT
echo "Hecho: $(du -sh "$OUT" | cut -f1) en $OUT"
