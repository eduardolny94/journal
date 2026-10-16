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
