@echo off
setlocal EnableDelayedExpansion
title Instalar GTFX_JournalSync en MetaTrader 5
echo.
echo  GTFX_JournalSync - instalador para MetaTrader 5
echo  Copia el servicio en la carpeta Services de cada MetaTrader 5 instalado en este usuario.
echo  No abre sesion en ninguna cuenta, no opera y no toca tus ordenes.
echo.
set "ORIGEN=%~dp0GTFX_JournalSync.ex5"
if not exist "%ORIGEN%" (
  echo  [ERROR] No encuentro GTFX_JournalSync.ex5 junto a este instalador.
  echo          Descarga los dos archivos en la misma carpeta ^(por ejemplo, Descargas^) y vuelve a ejecutarlo.
  echo.
  pause
  exit /b 1
)
set /a COPIADOS=0
for /d %%T in ("%APPDATA%\MetaQuotes\Terminal\*") do (
  if exist "%%T\MQL5\" (
    if not exist "%%T\MQL5\Services\" mkdir "%%T\MQL5\Services"
    copy /y "%ORIGEN%" "%%T\MQL5\Services\GTFX_JournalSync.ex5" >nul && (
      set /a COPIADOS+=1
      echo  [OK] %%T\MQL5\Services
    )
  )
)
echo.
if !COPIADOS!==0 (
  echo  [AVISO] No encontre ninguna carpeta de datos de MetaTrader 5 en %APPDATA%\MetaQuotes\Terminal.
  echo          Si tu MetaTrader esta en modo portable, abre en MT5: Archivo ^> Abrir carpeta de datos,
  echo          y copia GTFX_JournalSync.ex5 a mano dentro de MQL5\Services.
) else (
  echo  Listo: copiado en !COPIADOS! terminal^(es^).
  echo  Ahora en MetaTrader 5: Navegador ^> Servicios ^> clic derecho ^> Actualizar ^> clic derecho ^> Anadir servicio.
)
echo.
pause
exit /b 0
