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

## Suelo local de capital en el guardián (10-11-2026, v1.2)

Pedido de César para la cuenta financiada de The5ers: un bloqueo «sí o sí» tras cierta pérdida al día que no infrinja las
reglas de la firma. El hueco que había: el límite diario del journal se calcula con operaciones **cerradas**; una posición
abierta desde el móvil con −1.500 $ flotantes no bloqueaba nada, y The5ers mide su 3 % sobre la equidad.

`GTFX_JournalGuard.mq5` v1.2 añade una vigilancia que **no depende del journal ni de internet**:

- Al empezar cada día del broker guarda `base = max(balance, equidad)` (mismo criterio que The5ers) en variables
  globales del terminal, para que sobreviva a un reinicio.
- En cada tick y cada transacción: si `base − equidad ≥ PerdidaDiariaUSD` (por defecto 1.000 $ = 1 % de 100k, un tercio
  del 3 % de la firma) cierra todas las posiciones, borra las pendientes, deja el día marcado como bloqueado hasta el
  siguiente día del broker (también persistido) y avisa al journal con `POST /api/sync/mt5/bloquear`.
- Aviso con Alert al consumir el `AvisoPct` (70 %) del suelo.
- El journal registra el aviso como bloqueo `daily_loss` hasta el siguiente reinicio (`applyEquityLock` en risk.js, evento
  «Suelo de capital del guardián…») sin acortar un bloqueo más largo, y con bloqueo estricto sigue respondiendo
  `cerrar_todo`.

Compatibilidad con las prácticas prohibidas de The5ers (the5ers.com/faqs/prohibited-trading-practices, leído 10-11-2026):
el EA solo cierra, nunca abre ni modifica; manda órdenes al broker únicamente cuando hay algo que cerrar (la consulta
periódica va al journal, no al servidor del broker); el código fuente es propio y visible; no copia, no cubre, no opera
en el rollover. Lo que sí hay que evitar es **pelear con el bloqueo**: abrir desde el móvil mientras está bloqueado produce
operaciones de segundos que se parecen al tick scalping que la firma prohíbe.

Límite físico (igual que antes): necesita un MetaTrader abierto con la contraseña de operador (la de inversor no puede
cerrar), con AutoTrading activo, en un equipo encendido (Mac/PC o VPS). Si se cierra, deja de vigilar.
