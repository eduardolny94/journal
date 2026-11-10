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
