# Respaldo de todo lo que vive solo en este PC antes de formatear (proyectos, memoria de Claude, skills, MT5, claves).
# Uso (PowerShell):  .\scripts\respaldo-pc.ps1 -Destino "E:\"          (USB, disco externo u OneDrive)
# Crea la carpeta RESPALDO-CLAUDE-<fecha> en el destino. No copia node_modules ni dist (se reinstalan).
param(
  [Parameter(Mandatory = $true)] [string] $Destino
)
$ErrorActionPreference = 'Continue'
$fecha = Get-Date -Format 'yyyy-MM-dd'
$raiz = Join-Path $Destino "RESPALDO-CLAUDE-$fecha"
New-Item -ItemType Directory -Force -Path $raiz | Out-Null
$home_ = $env:USERPROFILE

function Copiar($origen, $destinoRel, $excluirDirs) {
  if (-not (Test-Path $origen)) { Write-Host "  (no existe) $origen"; return }
  $dest = Join-Path $raiz $destinoRel
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  $args = @($origen, $dest, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
  if ($excluirDirs) { $args += '/XD'; $args += $excluirDirs }
  & robocopy @args | Out-Null
  Write-Host "  copiado: $origen -> $destinoRel"
}

Write-Host "1) Proyectos (Desktop\claude, sin node_modules ni dist)"
Copiar (Join-Path $home_ 'Desktop\claude') 'Desktop-claude' @('node_modules', 'dist', '.vite', '.cache')

Write-Host "2) Claude Code: memoria, skills, ajustes, plugins, transcripciones"
Copiar (Join-Path $home_ '.claude') 'claude-home' @('cache', 'debug', 'statsig', 'telemetry', 'shell-snapshots', 'todos')
if (Test-Path (Join-Path $home_ '.claude.json')) { Copy-Item (Join-Path $home_ '.claude.json') (Join-Path $raiz 'claude.json') -Force; Write-Host "  copiado: .claude.json" }

Write-Host "3) Git y SSH"
foreach ($f in '.gitconfig', '.git-credentials') { $p = Join-Path $home_ $f; if (Test-Path $p) { Copy-Item $p (Join-Path $raiz $f) -Force; Write-Host "  copiado: $f" } }
Copiar (Join-Path $home_ '.ssh') 'ssh' @()

Write-Host "4) MetaTrader 5: código MQL5 (servicios, scripts, expertos) y ajustes del terminal"
$mq = Join-Path $env:APPDATA 'MetaQuotes\Terminal'
if (Test-Path $mq) {
  Get-ChildItem $mq -Directory | ForEach-Object {
    $mql5 = Join-Path $_.FullName 'MQL5'
    if (Test-Path $mql5) {
      foreach ($sub in 'Services', 'Scripts', 'Experts', 'Indicators', 'Include', 'Files') { Copiar (Join-Path $mql5 $sub) ("MT5\" + $_.Name + "\MQL5\" + $sub) @() }
      Copiar (Join-Path $_.FullName 'config') ("MT5\" + $_.Name + "\config") @()
    }
  }
}

Write-Host "5) Tarea programada del servidor local"
try { Export-ScheduledTask -TaskName 'GTFX Journal' | Out-File (Join-Path $raiz 'GTFX-Journal-tarea.xml') -Encoding utf8; Write-Host "  exportada: GTFX Journal" } catch { Write-Host "  (sin tarea programada GTFX Journal)" }

Write-Host "6) Lista de programas instalados (para reinstalar)"
try { winget export -o (Join-Path $raiz 'programas-winget.json') --accept-source-agreements | Out-Null; Write-Host "  exportada: programas-winget.json" } catch { Write-Host "  (winget no disponible)" }

$tam = (Get-ChildItem $raiz -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ""
Write-Host ("Respaldo listo en {0} ({1:N0} MB). Comprueba que el destino NO sea el disco que vas a formatear." -f $raiz, $tam)
