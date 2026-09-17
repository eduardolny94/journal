# Lanzador del servicio Global Traders FX (API + cliente compilado) para la tarea programada de Windows.
# Mantiene el servidor vivo: si el proceso muere, lo vuelve a arrancar a los 10 segundos.
# Registro: trading-journal\server\data\servicio.log
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $root 'server'
$log = Join-Path $serverDir 'data\servicio.log'
$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $node)) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }
$env:API_PORT = '3200'
$env:PORT = '3200'

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $log -Value $line -Encoding utf8
}

if (-not (Test-Path (Join-Path $serverDir 'data'))) { New-Item -ItemType Directory -Path (Join-Path $serverDir 'data') | Out-Null }
# Rotación simple del registro (máx. ~2 MB)
if ((Test-Path $log) -and ((Get-Item $log).Length -gt 2MB)) { Move-Item $log ($log + '.old') -Force }

Log "Servicio iniciado (node: $node)"
while ($true) {
  $listening = netstat -ano | Select-String 'LISTENING' | Select-String ':3200 '
  if ($listening) {
    Log 'Ya hay un servidor en el puerto 3200; espero 60 s'
    Start-Sleep -Seconds 60
    continue
  }
  Log 'Arrancando node src/index.js'
  $p = Start-Process -FilePath $node -ArgumentList 'src/index.js' -WorkingDirectory $serverDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $serverDir 'data\servidor.out.log') -RedirectStandardError (Join-Path $serverDir 'data\servidor.err.log')
  $p.WaitForExit()
  Log ("El servidor terminó con código {0}; reinicio en 10 s" -f $p.ExitCode)
  Start-Sleep -Seconds 10
}
