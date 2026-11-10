@echo off
setlocal EnableDelayedExpansion
title Instalar GTFX_JournalGuard en MetaTrader 5
echo.
echo  GTFX_JournalGuard - instalador para MetaTrader 5
echo  Copia el guardian del limite diario en la carpeta Experts de cada MetaTrader 5 instalado en este usuario.
echo  No abre sesion en ninguna cuenta ni abre operaciones: solo impide abrir mas al tocar tu limite del dia.
echo.
set "ORIGEN=%~dp0GTFX_JournalGuard.ex5"
if not exist "%ORIGEN%" (
  echo  [ERROR] No encuentro GTFX_JournalGuard.ex5 junto a este instalador.
  echo          Descarga los dos archivos en la misma carpeta ^(por ejemplo, Descargas^) y vuelve a ejecutarlo.
  echo.
  pause
  exit /b 1
)
set /a COPIADOS=0
for /d %%T in ("%APPDATA%\MetaQuotes\Terminal\*") do (
  if exist "%%T\MQL5\" (
    if not exist "%%T\MQL5\Experts\" mkdir "%%T\MQL5\Experts"
    copy /y "%ORIGEN%" "%%T\MQL5\Experts\GTFX_JournalGuard.ex5" >nul && (
      set /a COPIADOS+=1
      echo  [OK] %%T\MQL5\Experts
    )
  )
)
echo.
if !COPIADOS!==0 (
  echo  [AVISO] No encontre ninguna carpeta de datos de MetaTrader 5 en %APPDATA%\MetaQuotes\Terminal.
  echo          Si tu MetaTrader esta en modo portable, abre en MT5: Archivo ^> Abrir carpeta de datos,
  echo          y copia GTFX_JournalGuard.ex5 a mano dentro de MQL5\Experts.
) else (
  echo  Listo: copiado en !COPIADOS! terminal^(es^).
  echo  Ahora en MetaTrader 5: Navegador ^> Asesores Expertos ^> clic derecho ^> Actualizar, y arrastra GTFX_JournalGuard a un grafico.
)
echo.
pause
exit /b 0
