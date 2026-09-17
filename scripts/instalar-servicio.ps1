# Instala (o reinstala) la tarea programada "GTFX Journal" que arranca el servicio al iniciar sesión en Windows
# y lo mantiene vivo. Ejecutar una vez:  powershell -ExecutionPolicy Bypass -File scripts\instalar-servicio.ps1
$ErrorActionPreference = 'Stop'
$taskName = 'GTFX Journal'
$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root 'scripts\servicio.ps1'
$user = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DontStopOnIdleEnd -Hidden

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -User $user -RunLevel Limited -Description 'Global Traders FX: journal + radar de divisas (API en http://localhost:3200)' | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Tarea '$taskName' instalada y arrancada. Abre http://localhost:3200"
