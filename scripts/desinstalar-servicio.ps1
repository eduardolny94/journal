# Detiene y elimina la tarea programada "GTFX Journal" y cierra el servidor.
$taskName = 'GTFX Journal'
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
$l = netstat -ano | Select-String 'LISTENING' | Select-String ':3200 '
foreach ($line in $l) { $p = ($line.Line -split '\s+')[-1]; Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
Write-Output "Tarea '$taskName' eliminada y servidor detenido."
