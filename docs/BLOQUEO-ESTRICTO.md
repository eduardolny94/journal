# Bloqueo estricto (17-10-2026)

Pedido del usuario: que al tocar el límite la cuenta quede bloqueada «sí o sí», sin poder meter más operaciones.

## En el journal

Opción por cuenta `hard_lock` (Cuentas → editar → «Bloqueo estricto»). Con ella activa y la cuenta bloqueada por
pérdida diaria, semanal, máximo de operaciones o bloqueo manual:

- `POST /api/trades` responde 423 siempre: el `force` («registrar igual, romper mi regla») deja de existir.
- `POST /api/accounts/:id/unlock` responde 423: no hay desbloqueo manual; la cuenta se desbloquea sola en el reinicio.
- `PUT /api/accounts/:id` y `PUT /api/accounts/:id/risk` responden 423 si se intenta subir o quitar un límite, o
  desactivar el bloqueo estricto, mientras dure el bloqueo. Bajar un límite sí se puede.
- Desactivar el bloqueo estricto con la cuenta libre no es inmediato: queda programado para el siguiente reinicio del
  día de trading (`hard_lock_off_at`). Activarlo es inmediato.
- Las operaciones que llegan por sincronización (MT5, TradingView) o por CSV se guardan siempre (el journal es el
  registro) y quedan marcadas como «en bloqueo» (`violated_lock`) si se abrieron con la cuenta bloqueada
  (`wasLockedAt`, a partir de `lock_events`).

## En MetaTrader (guardián)

`GTFX_JournalGuard.mq5` (descargas): Asesor Experto que pregunta cada 5 s a `GET /api/sync/mt5/estado` con el token de
sincronización. Si la respuesta trae `action: "cerrar_todo"` (cuenta bloqueada con bloqueo estricto), cierra todas
las posiciones, borra las pendientes y vuelve a cerrar cualquier posición nueva en cada tick y en cada transacción,
hasta que el journal levante el bloqueo. Muestra el estado en el gráfico y avisa con Alert.

Límite físico: si el usuario quita el EA o apaga el AutoTrading, el guardián deja de actuar. El journal lo registra
igualmente como violación. El servicio de sincronización ya avisaba; el guardián actúa.

## Probado

`server/scripts/smoke.mjs`, bloque «bloqueo estricto»: activar, bloquear, 423 con force, 423 al desbloquear, 423 al
subir un límite, 200 al bajarlo, 423 al desactivar en bloqueo, `estado` con `cerrar_todo`, y desactivación programada.

## Guardián v2.0: límite de pérdida diaria por operaciones cerradas (10-11-2026)

Pedido de César para la cuenta financiada de The5ers (opera desde el móvil): que tras perder un % de la cuenta al día no
pueda meter más operaciones, **sin contar el flotante y sin cerrar las que ya están abiertas**, fácil de instalar en Mac y
Windows y sin infringir las reglas de la firma. (Una v1.2 de esa misma mañana medía la equidad con flotante y cerraba
todo: César la descartó.)

`GTFX_JournalGuard` v2.0 (`.mq5` y `.ex5` compilado en descargas, más `Instalar-GTFX-JournalGuard.bat` para Windows):

- Suma los *deals* de compra/venta del día del bróker (beneficio + comisión + swap + tarifa) leyendo el historial local.
  Límite = `PerdidaDiariaPct` % de `TamanoCuenta` (o del saldo al empezar el día si es 0).
- El bloqueo se deduce del historial (primer cierre en que el acumulado toca el límite), así que no depende de memoria ni
  de internet y sobrevive a reinicios. Una vez tocado, el día queda bloqueado aunque después se recupere.
- Bloqueada: las posiciones abiertas antes de ese cierre **se respetan**; toda posición posterior se cierra y las
  pendientes se borran (como mucho un intento por segundo). `CerrarAbiertas` y `BorrarPendientes` son opcionales.
- Aviso al 70 % y al bloquear, con Alert y notificación al móvil (`SendNotification`, requiere MetaQuotes ID).
- El token es opcional. Con token: obedece `cerrar_todo` del journal como «no abrir más» (respeta lo abierto antes de ver
  el bloqueo) y avisa con `POST /api/sync/mt5/bloquear { login, server, loss, limit }` → `applyGuardLock` registra un
  `daily_loss` hasta el siguiente reinicio sin acortar bloqueos más largos.

Compilado en el Mac con el MetaEditor de MetaTrader 5 (Wine): desde la carpeta del terminal,
`wine metaeditor64.exe '/compile:MQL5\Experts\GTFX_JournalGuard.mq5' /log` (0 errores, 0 avisos). Con la ruta completa
entre comillas no compila por los espacios.

Compatibilidad con las prácticas prohibidas de The5ers (the5ers.com/faqs/prohibited-trading-practices, leído 10-11-2026):
el EA nunca abre ni modifica; solo manda órdenes al bróker cuando hay una posición nueva que cerrar, con freno de un
intento por segundo (nada de «peticiones excesivas»); el código fuente es propio; no copia, no cubre, no opera en el
rollover. Riesgo real: **abrir estando bloqueado** genera operaciones de segundos parecidas al tick scalping prohibido.

Límite físico: necesita un MetaTrader de escritorio abierto en la cuenta con la contraseña de operador y Algo Trading
activo; desde el móvil no se puede impedir una orden, solo cerrarla en cuanto entra.

## Guardián v2.1: los límites salen de la ficha de la cuenta (10-11-2026)

Pedido de César: poner en el journal «100k, 1.500 al día, 4.000 a la semana» y que MetaTrader lo aplique solo.

- `GET /api/sync/mt5/estado` devuelve además `limit_daily`, `limit_weekly`, `limit_trades` (de `daily_max_loss`,
  `weekly_max_loss`, `max_trades_per_day`) y `account_name`. Con el token único, si el login no está enlazado y el usuario
  tiene una sola cuenta de MT5 sin enlazar, se enlaza con ella; con token de cuenta y otro login responde 409.
- El guardián guarda los límites en variables globales del terminal (sigue con ellos sin conexión) y calcula con el
  historial local la pérdida cerrada del día y de la semana del bróker (lunes 00:00) y las operaciones abiertas hoy.
- Bajar un límite se aplica al momento; subirlo o quitarlo queda pendiente hasta el siguiente día del bróker.
- El corte nunca es anterior al momento en que el guardián vio el bloqueo: si se baja un límite por debajo de lo ya
  perdido, lo que estaba abierto se respeta.
- `POST /api/sync/mt5/bloquear` acepta `kind`: `daily_loss`, `weekly_loss` (bloquea hasta el reinicio semanal) o
  `max_trades`.
- Sin token usa los parámetros (`PerdidaDiariaPct`, `PerdidaSemanalPct`, `MaxOperacionesDia`, `TamanoCuenta`).
- No hace falta «Bloqueo estricto» para que el guardián aplique los límites de la ficha; el estricto añade que el journal
  no deje desbloquear ni subir límites durante el bloqueo, y que sus bloqueos manuales lleguen también a MetaTrader.

Día y semana: el guardián usa los del bróker (medianoche del servidor = 17:00 de Nueva York en The5ers), que coinciden
con la ficha por defecto del journal (America/New_York, reinicio a las 17).

## Guardián v3.0: panel «Abrir con riesgo fijo» (11-11-2026)

Pedido de César: «un EA como position size, que pueda configurar todo y me venga de una vez según mi SL, el TP1 y TP2».

- Panel en el gráfico (objetos `GTFXP_*`): riesgo por operación %, TP1 y TP2 en veces el stop (R), % que se cierra en
  TP1, «stop a la entrada al tocar TP1». «Preparar operación» pone una línea roja de stop (1,5 × rango medio de 14 velas
  bajo el precio); se arrastra: debajo del precio = compra, encima = venta. Lotes = riesgo / pérdida por lote al stop
  (`OrderCalcProfit`), redondeado hacia abajo al paso de volumen; si el riesgo resultante supera el objetivo en 1 % no abre.
- Abre **una sola posición** (stop y TP2 en el bróker) y gestiona el TP1 localmente: al tocarlo, cierre parcial del % y stop
  a la entrada (una modificación). Motivo: la lista de prácticas prohibidas de The5ers define «bulk trading» como
  «multiple trades are open simultaneously»; abrir dos posiciones a la vez para TP1/TP2 podría leerse así, y además
  contaría como dos operaciones para el máximo diario. El TP1 necesita el terminal abierto; si está apagado, la operación
  sigue con su stop y su TP2.
- Seguridad: confirmación antes de enviar (`ConfirmarAbrir`), 1,5 s de espera tras preparar, no abre si la cuenta está
  bloqueada o Algo Trading está apagado, riesgo máximo 5 %. El guardián fija el modo de ejecución del símbolo antes de
  abrir o cerrar (`SetTypeFillingBySymbol`; antes usaba el modo por defecto, que algunos brókers rechazan).
- Temporizador a 1 s para el TP1; la consulta al journal sigue cada `Segundos`.
- Sin probar con órdenes reales al publicarlo: solo compilado. Probar primero en una cuenta demo de MetaQuotes.

Token: los mensajes de «token no válido» ya no dicen «genera uno nuevo» (César lo hacía cada vez y anulaba el anterior);
guardián y servicio comparten el token válido en la carpeta común. En el Mac, el segundo terminal (B) debe arrancar con
`USER=user` para compartir esa carpeta con la app oficial (corregido en `~/.local/bin/mt5-b`).

