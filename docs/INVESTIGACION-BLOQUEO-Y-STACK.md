# Investigación: bloqueo automático de cuentas prop (Lucid) y stack de conexión

**Fecha:** 2026-09-10
**Producto:** journal web para traders (PNL diario/semanal/mensual, calendario, fotos, patrones, notas) con un "limitador" por cuenta de prop firm (ej. Lucid Trading): el trader fija un riesgo máximo diario/semanal y la cuenta debe quedar bloqueada al perderlo. Objetivo deseado: "conecto Lucid, selecciono la cuenta, me sale el calendario y el PnL, pongo el límite y todo es automático", sin cargar operaciones a mano.

## Cómo leer este informe

- La base es una investigación previa de 5 temas (Lucid, Tradovate API, ProjectX/TopstepX, Rithmic, forex/MT5/cTrader). Su fase de verificación adversarial **no se ejecutó** por límite de sesión. Todas las afirmaciones que vienen de ahí se marcan **[NV]** = *no verificada de forma independiente* (tienen URL, pero nadie intentó refutarlas).
- Lo investigado hoy (6 búsquedas, 6 páginas leídas) cubre solo tres huecos: (a) add-ons NinjaScript de NinjaTrader 8, (b) cómo sincronizan los journals competidores, (c) evidencia 2025-2026 sobre API keys de Tradovate en cuentas prop. Se marca **[V-hoy]** cuando leí la página completa y **[S]** cuando solo tengo el fragmento del buscador.
- **[INF]** = inferencia técnica razonable, sin fuente que la confirme. Hay que probarla.

Glosario rápido: *flatten* = cerrar todas las posiciones a mercado; *lockout/bloqueo duro* = el servidor rechaza órdenes nuevas; *bloqueo blando* = solo el journal marca la cuenta como bloqueada (sistema de honor); *DLL* = Daily Loss Limit; *RMS* = motor de riesgo del servidor (Rithmic); *prop firm* = empresa que financia cuentas de trading con reglas.

---

## 1. Respuesta corta

1. **Bloquear una cuenta Lucid desde nuestra app, por API, al perder X: NO es posible hoy.** Lucid no tiene API pública [NV], las cuentas prop en Tradovate no pueden generar API keys (evidencia consistente 2024-2026, sin excepción documentada) [V-hoy], y la API de Rithmic es de solo lectura para riesgo [NV]. Nadie externo puede poner la cuenta en "rechazar órdenes" salvo la propia prop firm.
2. **Lo que SÍ existe es un bloqueo duro nativo que el trader configura él mismo** en Tradovate (Risk Settings + "Lock Risk Settings if Hit") [NV] o en R|Trader Pro (Auto Liquidate, editable por el trader) [NV]. El journal puede guiarlo y verificar que lo hizo.
3. **Cerrar posiciones automáticamente (flatten) SÍ es viable** con un add-on NinjaScript en NinjaTrader 8 (Account.Flatten + interceptar órdenes, como hacen KosyGuard y Account Risk Manager) [V-hoy], pero solo mientras NinjaTrader esté abierto y solo para órdenes de NinjaTrader.
4. **Sincronizar operaciones automáticamente: SÍ, con matices.** Los journals líderes lo hacen con las credenciales de plataforma del trader (Tradovate y Rithmic) sin usar la API de pago [V-hoy para TradesViz/Rithmic; INF para Tradovate]; la vía sin riesgo y de esfuerzo mínimo es importar CSV/carpeta vigilada.
5. **Falta confirmar con Lucid:** qué Risk Settings de Tradovate están habilitados, si toleran login de terceros con credenciales, si entregan R|API+, y si permiten add-ons de riesgo. Plantilla en la sección 6.

---

## 2. Tabla de viabilidad por plataforma

Niveles (de más a menos fuerte):
- **A. Bloqueo real por API** = una app externa deja la cuenta rechazando órdenes nuevas.
- **B. Cierre automático por API** = una app externa puede aplanar y cancelar, pero el trader puede volver a operar.
- **C. Límite nativo de la plataforma** = el trader lo configura en la UI y el servidor lo aplica (bloqueo real, sin nuestra app).
- **D. Solo bloqueo blando** = el journal marca "bloqueado" y avisa.

| Plataforma | Nivel máximo para un trader/app externa | Cómo | Costo y requisitos | Riesgo con reglas de la prop firm |
|---|---|---|---|---|
| **Tradovate — cuenta prop (Lucid)** | **C** (nativo) + **D** | Risk Settings: Daily/Weekly Loss Limit "exits trades and locks trading" + "Lock Risk Settings if Hit" (ni soporte lo desbloquea hasta el reset 5 PM CT) [NV]. Ninguna API para el trader: API keys excluidas en cuentas prop [V-hoy]. "Manual Lockout" (2026) solo documentado en Tradovate Prop, no en firmas terceras [NV]. | $0. Falta confirmar qué settings expone Lucid (cada firma puede ocultar algunos) [NV]. | Bajo: es función nativa. Lucid reconoce "platform-side personal risk settings" en su FAQ [NV]. |
| **Tradovate — cuenta personal live** | **B** (+ posible A vía risk API) | REST/WebSocket oficial: `cashBalance` en vivo, `/order/liquidateposition`, entidad `UserAccountAutoLiq` (`dailyLossAutoLiq`, `doNotUnlock`) [NV]. Si `updateuserautoliq` funciona con API key personal, sería bloqueo real. | Add-on API Access ~$25/mes + cuenta live ≥$1,000 equity + API key con scopes [NV]. | No aplica a Lucid. Solo cuentas propias. |
| **ProjectX / TopstepX** | **B** + **C** | API oficial ($29/mes): `Trade/search` (PnL), `Position/closeContract`, `Order/cancel`; sin endpoints de risk settings. Nativo en UI: PDLL "Liquidate & Block", "Lock Risk Settings", "Set Lockout" [NV]. | $29/mes ($14.50 con código). Solo Topstep desde feb-2026; **Lucid ya no usa ProjectX** [NV]. | Alto si el cierre lo ejecuta un servidor en la nube: Topstep prohíbe operar desde VPS/servidor remoto; "tu servidor puede mirar y registrar, no operar" [NV]. |
| **Rithmic / R|Trader Pro (Lucid)** | **B** (como vendor) + **C** (semi) | R|API+/R|Protocol: leer fills, RMS info (solo lectura), cancelar todo, `exit_position` [NV]. Nativo: "Risk Parameters set by the Trader" → Auto Liquidate = Loss Limit (server-side, sigue activo con la plataforma cerrada) y "Enable Liquidating Only (Trader)"; ambos editables por el propio trader [NV]. | ~$125/mes por User ID + $0.10/contrato + conformance test (días-semanas) [NV]. Un journal sería "vendor" y debe certificarse [NV]. Sin evidencia de que Lucid entregue R|API+ [NV]. | Medio: una sesión por login (conectar el journal con el login del trader desconecta su plataforma) [NV]. Bots permitidos por Lucid [NV]. |
| **NinjaTrader 8 (CQG/Lucid)** | **B** local + **D** (y **C** limitado) | Add-on NinjaScript: `Account.ExecutionUpdate`, `Executions`, `Account.Flatten()` documentados [V-hoy]; interceptar y cancelar órdenes nuevas (patrón KosyGuard) [V-hoy]; HTTP al journal con .NET HttpClient [INF]. Risk Settings nativos de NT "no alcanzan la cuenta prop" en muchas conexiones [V-hoy]. | $0 (NinjaTrader va incluido con Lucid vía CQG [NV]). Desarrollo C#. | Bajo-medio: automatización permitida por Lucid; cuidado con reentradas rápidas tras el flatten (microscalping/HFT) [NV]. Solo funciona con NT abierto; el trader puede desinstalarlo. |
| **MT4 / MT5** | **B** (EA o MetaApi) + **D** | EA MQL5 cierra y cancela, pero su estado "HALTED" es local y no frena órdenes manuales; MetaApi.cloud lee equity y cierra posiciones, no bloquea [NV]. Manager API (bloqueo real) solo para brokers [NV]. | EA: $0 + VPS/terminal encendido. MetaApi: por cuenta/hora (precio no verificado) [NV]. | Alto: FundedNext limita EAs (<$50k, fee); Funding Pips solo como risk manager; entregar contraseña a un cloud puede violar "account sharing" [NV]. |
| **cTrader** | **B** + **D** | Open API con OAuth (scope `accounts` solo lectura / `trading`), `ProtoOAClosePositionReq`; sin mensaje para deshabilitar trading [NV]. | $0, cualquier broker cTrader [NV]. | Medio: FundedNext prohíbe bots en cTrader [NV]. |
| **DXtrade / Match-Trader** | **B** (si la firma lo abre) / **D** | DXtrade REST/Push API la abre cada prop firm (IP allowlist); Match-Trader Platform API solo corporativo, bloqueos viven en el Prop API del broker [NV]. | Depende de cada firma. | Medio-alto: hay que pedir permiso firma por firma [NV]. |
| **TradeLocker** | **B** + **D** | Public API (JWT con email/password/server), `close_all_positions`, 2 req/s, Developer Program [NV]. Sin lockout. | $0; API key de desarrollador para multiusuario [NV]. | Medio: comparte contraseña con un servicio [NV]. |

**Conclusión de la tabla:** el nivel A no existe para nadie que no sea la prop firm/broker. Para Lucid, la combinación realista es **C (guiado por el journal) + B (add-on NinjaTrader) + D (journal)**.

---

## 3. Cómo conseguir "conectar Lucid y que todo sea automático"

Ordenado por viabilidad (de "hazlo ya" a "quizá algún día"). Esfuerzos estimados para un desarrollador principiante con ayuda de IA.

### 3.1 Importar CSV de Tradovate / NinjaTrader / R|Trader Pro (viabilidad: alta, MVP)
- **Cómo:** el trader exporta el reporte de operaciones (Tradovate web: Reports → Trades; NinjaTrader: Control Center → Trade Performance → exportar; R|Trader Pro: Recent Orders/Trades → export) y lo sube al journal. Variante "casi automática": carpeta vigilada en Google Drive/Dropbox y el journal la lee cada X minutos (TradesViz ofrece exactamente esto para quien no quiere dar credenciales) [V-hoy].
- **Costo:** $0. **Esfuerzo:** 1-2 semanas (3 parsers + deduplicación por id de fill + mapeo de cuenta).
- **Limitaciones:** no es tiempo real; el limitador solo puede actuar a posteriori (bloqueo blando). Formatos cambian sin aviso.
- **Confirmar con Lucid:** nada; es 100% lícito.

### 3.2 Auto-sync con las credenciales de plataforma del trader (viabilidad: media-alta, es lo que hacen los journals)
- **Cómo:** el trader introduce en el journal el usuario/contraseña que Lucid le dio para Tradovate (trader.tradovate.com) o para Rithmic (usuario + contraseña + "system name"/host + IDs de cuenta). El backend hace login y lee fills/cashBalance periódicamente.
  - **Rithmic:** TradesViz documenta este flujo: "You have to enter your username and password and the host URL on the import page", con varios Account IDs a la vez; pero "This sync can only be triggered manually from your side because we NEVER store your username or password" [V-hoy]. Tanto (Tradetanto) afirma sincronizar Apex/Bulenox/Earn2Trade/Topstep "with the same credentials your firm gave you" [V-hoy, fuente competidora].
  - **Tradovate:** TradeZella y TradesViz listan Tradovate como "Auto Sync" [V-hoy]. Técnicamente el endpoint `POST /auth/accesstokenrequest` solo exige `name` y `password` (cid/sec son para 2FA/API key) [NV] → **[INF]** los journals usan este login con credenciales, no la API de pago. No lo he verificado en una cuenta Lucid.
- **Costo:** $0 para el usuario. **Esfuerzo:** 3-6 semanas (login, tokens de ~80-90 min, WebSocket `user/syncrequest` o polling, manejo de `p-ticket`/`p-captcha`, cifrado de credenciales) [NV].
- **Limitaciones / riesgos:** guardar contraseñas de terceros (seguridad y responsabilidad); límite de sesiones concurrentes en Tradovate (1-2) [NV] y **una sola sesión por login en Rithmic** (conectar el journal expulsa a la plataforma del trader) [NV]; Tradovate puede exigir captcha tras fallos [NV]; posible violación de "account sharing" si Lucid lo interpreta así.
- **Confirmar con Lucid:** si aceptan que un journal haga login de solo lectura con las credenciales del trader (TradeZella/TradesViz ya lo hacen con otras firmas, lo que sugiere tolerancia general, pero no hay texto de Lucid).

### 3.3 Add-on NinjaTrader 8 que envía operaciones al journal y aplica el límite (viabilidad: media-alta, es la única vía "automática de verdad" para Lucid hoy)
- **Cómo:** un add-on NinjaScript (C#) instalado en el NinjaTrader del trader, conectado a la cuenta Lucid vía CQG:
  - Se suscribe a `Account.ExecutionUpdate` / `Account.OrderUpdate` y lee la colección `Executions` de la sesión [V-hoy, help guide oficial].
  - Envía cada fill al journal por HTTPS (HttpClient de .NET; NinjaScript es C# completo) **[INF: no leído en doc oficial, pero es el mecanismo de CrossTrade/TradersPost]**.
  - Calcula PnL neto de la sesión y, al tocar el límite, ejecuta `Account.Flatten()` y cancela órdenes [V-hoy]; después intercepta cada orden nueva y la cancela ("every order you send is checked against your active rules before it reaches the market… the order is cancelled instantly", KosyGuard) [V-hoy].
  - Persiste el bloqueo en disco para que sobreviva a reinicios ("if you were locked before closing NT, you'll still be locked when you reopen") [V-hoy].
- **Precedentes comerciales:** KosyGuard (~$30/mes, prueba 14 días, "any NT8 account — sim, live, Rithmic, Tradovate, prop firms") [V-hoy]; Account Risk Manager de Affordable Indicators ($175 lifetime [NV]; "A market order is immediately submitted to flatten all open positions… locks out from trading for the rest of the day"; pensado "particularly for prop firm evaluation accounts connected through Tradovate or third-party Rithmic providers") [V-hoy]; RiskMaster (gratis, itch.io) [S].
- **Costo:** $0 para el usuario. **Esfuerzo:** 4-8 semanas (C#, instalador .zip de NinjaTrader, cola offline, autenticación con token del journal).
- **Limitaciones:** solo funciona con NinjaTrader abierto y conectado; no ve ni frena órdenes lanzadas desde Tradovate web/móvil o TradingView (**[INF]** los fills de otras plataformas sí deberían aparecer en `Executions` porque la cuenta es la misma; verificar); el trader puede desinstalar el add-on (Affordable Indicators lo admite: "As a third-party provider, we're limited in our ability to fully restrict trading") [NV]. Los Risk Settings nativos de NT8 "either don't reach the prop account or don't have the granularity traders need" [V-hoy] y, según un usuario, solo aplican a estrategias automatizadas [S].
- **Confirmar con Lucid:** que un add-on de riesgo/automatización de este tipo está permitido (sus reglas permiten "automated trading systems and trade copiers" [NV]).

### 3.4 Vendors autorizados (TradersPost, PickMyTrade, Tradecopia, TradeSyncer, CrossTrade) (viabilidad: media)
- **Cómo:** estos servicios ya se conectan a cuentas Lucid vía Rithmic/Tradovate/NinjaTrader y ofrecen "daily loss limit → cerrar a mercado y pausar" [NV]. El journal podría (a) recomendar uno y (b) integrarse por webhook: el journal dispara "flatten + pausa" y recibe fills si el vendor los expone.
- **Costo:** $30-65/mes para el usuario (p. ej. TradingView + bridge ~$65/mes según PickMyTrade) [S]. **Esfuerzo:** 2-4 semanas por vendor.
- **Limitaciones:** dependencia de un tercero; no está claro que expongan el historial de fills al journal ni la latencia; su "bloqueo" tampoco es RMS: pausan su propio copiado, no la cuenta [NV].
- **Confirmar:** con cada vendor, si tienen API/webhooks de lectura de PnL y de "pausa"; con Lucid, nada nuevo (ya los autorizan) [NV].

### 3.5 Rithmic R|API+ como vendor certificado (viabilidad: baja-media, largo plazo)
- **Cómo:** registrar el journal como vendor Rithmic (system name, dev kit, conformance test), conectarse al order plant y leer fills/PnL de las 9 plataformas Rithmic de Lucid (Quantower, R|Trader Pro, Sierra, etc.), con `exit_position` + cancelar todo [NV].
- **Costo:** ~$125/mes por User ID si es el trader quien paga; costos de vendor no publicados [NV]. **Esfuerzo:** 2-4 meses (protobuf/WebSocket + conformance).
- **Limitaciones:** riesgo de solo lectura (no se puede fijar loss limit ni deshabilitar) [NV]; una sesión por login salvo modo plugin de R|Trader Pro [NV].
- **Confirmar con Lucid y Rithmic:** si Lucid entrega credenciales R|API+ a sus traders y si aceptan un vendor nuevo sobre sus cuentas.

### 3.6 Tradovate API oficial en cuentas personales (viabilidad: alta técnicamente, pero NO sirve para Lucid)
- **Cómo:** para traders con cuenta live propia: API Access ($25/mes, ≥$1,000 equity, API key con scopes), WebSocket `cashBalance` + `/order/liquidateposition` + `UserAccountAutoLiq` [NV].
- **Evidencia 2024-2026 de que NO aplica a prop:** hilo oficial "API Access for PropFirm Accounts": *"personal api keys generally dont carry over to prop accounts"* (Johann_Birle, 21-jul-2026), sin respuesta de staff ni excepción [V-hoy]; PickMyTrade 2026: Tradovate "excludes Apex, Topstep, Bulenox, and similar evaluation or funded prop accounts from API access entirely" [S].
- **Esfuerzo:** 3-5 semanas. Útil como segundo segmento de usuarios (cuentas propias).

### 3.7 Extensión de navegador sobre el dashboard de Lucid / Tradovate web (viabilidad: baja, frágil)
- **Cómo:** una extensión lee el DOM (PnL, estado de cuenta) y lo envía al journal; puede automatizar clics ("Flatten", Risk Settings) como hace trevislee/tradovate-lockout con Playwright + bloqueo DNS [NV].
- **Costo:** $0. **Esfuerzo:** 2-4 semanas, más mantenimiento continuo.
- **Limitaciones:** se rompe con cualquier cambio de UI; solo funciona con el navegador abierto; podría chocar con "Trade with Integrity" de Lucid [NV]; no cubre NinjaTrader ni plataformas Rithmic.
- **Confirmar con Lucid:** si consideran aceptable automatizar su dashboard.

**Ruta recomendada:** 3.1 (ya) → 3.3 (add-on NinjaTrader, diferenciador real) → 3.2 (auto-sync con credenciales, tras confirmar con Lucid) → 3.6 para cuentas personales. 3.4/3.5 según demanda.

---

## 4. Diseño del limitador en 3 niveles

### 4a. Bloqueo blando en el journal (ya implementado)
Mejoras baratas que copian lo que funciona en la competencia:
- Barra de progreso "pérdida del día / límite" y "de la semana / límite" en el calendario, alimentada por CSV/auto-sync.
- Pantalla de compromiso al abrir la sesión ("hoy mi límite es -$X; si lo toco, cierro NinjaTrader") con confirmación explícita.
- Alertas por email/push al 50 %, 80 % y 100 %; al 100 % el journal marca la cuenta BLOQUEADA hasta el reset de sesión (5 PM CT / 6 PM ET, igual que Tradovate y Lucid) y registra cualquier operación posterior como "violación" en el calendario.
- Checklist de verificación: el trader sube una captura de sus Risk Settings nativos (nivel 4b) y el journal muestra "límite nativo configurado" junto a la cuenta.

### 4b. Límites nativos configurados por el trader, guiados desde el journal
Aquí está el bloqueo duro real y gratuito. El journal debe mostrar estos pasos con capturas y el monto exacto (por debajo del DLL fijo de Lucid, p. ej. 50K = $1,200 [NV]).

**Tradovate (vale también para NinjaTrader y TradingView conectados a la cuenta Lucid-CQG)** [NV, pasos según doc de NinjaTrader/Tradovate y Zendesk]:
1. Entrar en trader.tradovate.com con las credenciales que dio Lucid.
2. Menú de aplicación (icono de engranaje / "Application Settings") → **Risk Settings**.
3. Seleccionar la cuenta Lucid.
4. Activar **Daily Loss Limit** y escribir el monto (PnL neto, comisiones incluidas). Opcional: **Weekly Loss Limit**.
5. Activar **"Lock Risk Settings if Hit"** (= Risk Settings Lock). Al dispararse: cierra posiciones, cancela órdenes y bloquea nuevas hasta el reset (5 PM CT); "Tradovate's Support team is unable to unlock an account when its risk settings have been locked".
6. Guardar y hacer captura para el journal.
   - Nota: la doc dice que cada prop firm puede limitar qué settings aparecen; si Daily Loss Limit no aparece en la cuenta Lucid, preguntar a soporte (sección 6).
   - "Trailing Max Drawdown" no aplica a cuentas de evaluación [NV].

**R|Trader Pro (vale para Quantower, Sierra, Bookmap, etc., porque el parámetro vive en el servidor de Rithmic)** [NV]:
1. Abrir R|Trader Pro con el login de Lucid → **File → Trader Dashboard**.
2. Clic derecho sobre la cuenta → **Risk Parameters** (Ctrl+E) → pestaña **"Risk Parameters set by the Trader"**.
3. **Auto Liquidate = Enabled** → **Auto Liquidate Criteria = Loss Limit** → **Threshold** = monto (cuenta PnL no realizado).
4. Si aparece **"Lock On Auto Liquidate"**, marcarlo; **Apply**.
5. Para un bloqueo manual inmediato: clic derecho en la cuenta → **"Enable Liquidating Only (Trader)"** (solo acepta órdenes que reduzcan posición; en NinjaTrader se ve "Rejected at RMS").
   - Advertencias: el propio trader puede quitar estos parámetros intradía; según EdgeClear el auto-liquidate del trader "no deshabilita la cuenta" (una orden nueva se abre y se cierra al instante), mientras Discount Trading dice que queda bloqueada el resto del día: discrepancia sin resolver [NV].

**Otras plataformas Rithmic de Lucid** [NV]: Tradesea (PDLL "Liquidate and Block" + Personal Lockouts), Quantower 1.147.1+ (panel Risk Management con bloqueo de ajustes), Sierra Chart (Daily Net Loss + "Lock for Day", solo con Sierra abierta).

### 4c. Guardián automático (add-on NinjaTrader o API)

**Pseudoflujo del add-on NinjaScript (NinjaTrader 8, cuenta Lucid vía CQG):**
```
OnStartUp:
  cfg = GET journal/api/accounts/{id}/limits   (límite diario, semanal, buffer, token)
  lock = leer archivo local lock.json (fecha de sesión, bloqueado sí/no)
  account.ExecutionUpdate += OnExec
  account.OrderUpdate     += OnOrder
  account.AccountItemUpdate += OnAccountItem   (RealizedProfitLoss, UnrealizedProfitLoss)

OnExec(e):
  encolar fill {cuenta, instrumento, lado, qty, precio, hora, orderId, comisión}
  POST journal/api/fills (async, reintento con backoff; cola en disco si no hay red)

OnAccountItem(e):
  pnlNeto = realizado + noRealizado - comisiones (desde el reset de sesión 5 PM CT)
  if !lock.bloqueado && (pnlNeto <= -(cfg.diario - cfg.buffer) || pnlSemana <= -cfg.semanal):
      account.Flatten(instrumentos con posición)     // orden de mercado
      account.Cancel(todas las órdenes activas)
      lock = {bloqueado: true, hasta: próximo reset}; guardar lock.json
      POST journal/api/lock {cuenta, pnlNeto, hora}
      mostrar ventana modal "Cuenta bloqueada hasta las 5 PM CT"

OnOrder(e):
  if lock.bloqueado && e.Order.OrderState in (Initialized, Submitted, Accepted, Working)
     && la orden aumentaría la posición:
      account.Cancel(e.Order)                          // patrón KosyGuard
      log + POST journal/api/violations

OnTimer (cada 30 s): heartbeat al journal; si el journal no recibe heartbeat, muestra "guardián desconectado".
```

**Latencia esperada:** los eventos de cuenta en NinjaTrader llegan en milisegundos; una orden de mercado en ES/NQ se llena normalmente en menos de un segundo; el POST al journal es asíncrono y no frena nada. Riesgo de deslizamiento: si el mercado se mueve rápido, el fill queda más allá del límite → usar un **buffer** (p. ej. 5-10 % del límite) y bloquear antes del DLL fijo de Lucid.

**Riesgos:**
- Si NinjaTrader está cerrado, no hay guardián: combinar siempre con el nivel 4b.
- Órdenes desde Tradovate web/móvil o TradingView no pasan por `OnOrder` (no se cancelan); **[INF]** sus fills sí deberían verse en `Executions` y disparar el flatten.
- Reentradas repetidas tras el flatten pueden parecer trading de alta frecuencia o microscalping (Lucid marca >50 % del profit en trades ≤5 s y detecta HFT) [NV]: el bloqueo de órdenes debe ser previo al envío, no "abrir y cerrar".
- Lucid hace responsable al trader de errores de software [NV]: probar en cuenta sim/eval barata antes.
- El trader puede desinstalar el add-on; el journal debe registrar "guardián desactivado" como evento visible.

**Variante API (cuentas personales Tradovate o TopstepX):** el mismo flujo con `user/syncrequest` (cashBalance) → `/order/liquidateposition` [NV], o `GatewayUserTrade` → `Position/closeContract` [NV]; en Topstep, ejecutar el cierre desde el dispositivo del usuario (app local), no desde la nube [NV].

---

## 5. Competidores y qué replicar

### Journals (sincronización)
| Journal | Tradovate | NinjaTrader | Rithmic | TopstepX | Notas |
|---|---|---|---|---|---|
| **TradeZella** | Auto Sync [V-hoy] | Auto Sync + archivo [V-hoy] | Solo archivo (R Trader) [V-hoy] | Archivo [V-hoy] | Un competidor afirma que su auto-sync corre "cada 3 horas" y que NinjaTrader se sincroniza por el backend Tradovate/Rithmic [S, fuente competidora]. |
| **TradesViz** | Auto sync (artículo aparte, no leído) | Vía Tradovate/Rithmic o archivo [S] | Usuario+contraseña+host+IDs, disparo manual, no guardan credenciales; alternativa CSV en Google Drive [V-hoy] | — | Rastreador de cumplimiento prop (DLL, drawdown, consistencia) para 36+ firmas [S]. Aviso: "Auto-sync only brings in recent/new trades going forward". |
| **TraderSync** | CSV [V-hoy, fuente competidora] | CSV | CSV | CSV | Columna "Auto Sync" sin marcar para futuros según Tradetanto. |
| **Tanto (Tradetanto)** | Nativo | Nativo | Nativo con credenciales de la firma | Vía ProjectX | "Connect once, trades show up on their own" [V-hoy, es su propia web]. |

### Herramientas de lockout
- **KosyGuard** (NT8, ~$30/mes): intercepta y cancela órdenes que rompen reglas, lockout persistente entre reinicios, cualquier conexión NT8 [V-hoy].
- **Account Risk Manager** (Affordable Indicators, NT8, $175 [NV]): flatten a mercado + bloqueo por sesión, realizado o realizado+no realizado, orientado a cuentas prop vía Tradovate/Rithmic [V-hoy].
- **RiskMaster** (NT8, gratis, itch.io) [S].
- **PropGuard.cloud** (~$75/mes): conexión directa al order gateway de Rithmic, "Session Locking" [NV]. **CrossTrade**: aplana y rechaza órdenes el resto de la sesión en NinjaTrader [NV].
- **Copiers con límite diario** sobre cuentas Lucid: Tradecopia, TradeSyncer, PickMyTrade, TradersPost [NV].
- **trevislee/tradovate-lockout** (open source): Playwright + bloqueo DNS de hosts [NV].
- **Nativos:** Tradovate Risk Settings + Lock; Tradovate/NinjaTrader Prop "Manual Lockout" (15 min → 24 h, solo cuentas sim de esas firmas) [NV]; TopstepX PDLL/Lockout [NV]; Quantower Risk Management; Tradesea PDLL; Sierra "Lock for Day" [NV].

### Qué replicar en nuestro journal
1. Rastreador de cumplimiento por cuenta prop (DLL fijo de Lucid, MLL, consistencia 40 %/20 %) junto al límite personal.
2. Importación por carpeta vigilada (Google Drive) además del CSV manual.
3. Asistente paso a paso de límites nativos con captura de verificación (sección 4b).
4. Add-on NinjaTrader con modelo "interceptar antes de enviar" + lock persistente + opciones de cooldown (15 min / 30 min / 1 h / sesión), copiando la UX de Manual Lockout y KosyGuard.
5. Registrar y mostrar violaciones e "guardián desconectado" en el calendario (la mayoría solo bloquea; ninguno lo convierte en dato de journal).

---

## 6. Incertidumbres y plantilla de mensaje para soporte de Lucid

### Incertidumbres principales (ordenadas por impacto)
1. **Risk Settings de Tradovate en cuentas Lucid:** ¿aparecen Daily Loss Limit, Weekly Loss Limit y "Lock Risk Settings if Hit"? ¿Existe "Account Lockout" manual? [NV, la doc dice que cada firma puede ocultarlos].
2. **Login de terceros con credenciales del trader** (journals, add-ons): ¿lo tolera Lucid o lo considera "account sharing"? [sin fuente].
3. **R|API+:** ¿Lucid entrega credenciales a traders o a vendors? [NV: ninguna mención].
4. **Add-ons de riesgo en NinjaTrader** (KosyGuard, propio): ¿permitidos explícitamente? [NV: bots/copiers permitidos en general].
5. **Fills de otras plataformas** visibles en `Account.Executions` de NinjaTrader [INF].
6. **R|Trader Pro:** si el Auto Liquidate del trader deshabilita o no la cuenta ("Done For Day") [NV, fuentes contradictorias].
7. **Montos exactos del DLL de Lucid** por plan (fuente secundaria jun-2026) [NV].
8. **Todas las afirmaciones [NV]** de las secciones 2-5 requieren la verificación adversarial que no se ejecutó.

### Plantilla — Español
```
Asunto: Consultas técnicas sobre gestión de riesgo personal y conexiones de terceros

Hola equipo de Lucid Trading,

Estoy desarrollando un journal de trading para uso personal (registro de operaciones, PnL
diario/semanal y un límite de pérdida personal más estricto que el DLL de Lucid). Antes de
conectar nada quiero asegurarme de cumplir sus reglas. Les agradecería confirmar:

1. Tradovate (feed CQG): en una cuenta [evaluación/funded, tamaño $__K], ¿qué Risk Settings
   están habilitados para el trader? En concreto: Daily Loss Limit, Weekly Loss Limit,
   "Lock Risk Settings if Hit" y "Account Lockout" manual.
2. API de Tradovate: ¿es posible generar una API key personal (add-on "API Access") en una
   cuenta Lucid? Si no, ¿existe algún proceso para habilitarla a través de Lucid?
3. Rithmic: ¿entregan credenciales R|API+ / R|Protocol API a traders o a proveedores
   (vendors) que quieran leer fills y PnL de la cuenta? ¿Con qué costo?
4. Journals y add-ons: ¿permiten que un journal (por ejemplo TradeZella, TradesViz o uno
   propio) inicie sesión de solo lectura con mis credenciales de Tradovate/Rithmic para
   importar operaciones? ¿Y un add-on de NinjaTrader 8 que cierre mis posiciones y cancele
   mis órdenes cuando alcance mi límite personal (similar a KosyGuard o Account Risk Manager)?
5. R|Trader Pro: si configuro "Auto Liquidate → Loss Limit" en "Risk Parameters set by the
   Trader", ¿la cuenta queda bloqueada hasta la siguiente sesión o solo se liquida?
6. ¿Pueden configurar desde su lado (R|Manager / Tradovate admin) un DLL personalizado más
   bajo que el estándar si el trader lo solicita?

Muchas gracias por su ayuda.
[Nombre] — cuenta [ID/email]
```

### Template — English
```
Subject: Technical questions about personal risk settings and third-party connections

Hi Lucid Trading team,

I'm building a personal trading journal (trade log, daily/weekly PnL and a personal loss
limit stricter than Lucid's DLL). Before connecting anything I want to make sure I comply
with your rules. Could you please confirm:

1. Tradovate (CQG feed): on a [evaluation/funded, $__K] account, which trader-level Risk
   Settings are enabled? Specifically: Daily Loss Limit, Weekly Loss Limit, "Lock Risk
   Settings if Hit" and manual "Account Lockout".
2. Tradovate API: can a personal API key (the "API Access" add-on) be generated on a Lucid
   account? If not, is there any process to enable it through Lucid?
3. Rithmic: do you provide R|API+ / R|Protocol API credentials to traders or to vendors
   that want to read fills and PnL from the account? At what cost?
4. Journals and add-ons: do you allow a trading journal (e.g. TradeZella, TradesViz or my
   own) to log in read-only with my Tradovate/Rithmic credentials to import trades? And a
   NinjaTrader 8 add-on that flattens my positions and cancels my orders when my personal
   limit is hit (similar to KosyGuard or Account Risk Manager)?
5. R|Trader Pro: if I set "Auto Liquidate → Loss Limit" under "Risk Parameters set by the
   Trader", is the account locked until the next session or only liquidated?
6. Can you configure on your side (R|Manager / Tradovate admin) a custom DLL lower than the
   standard one if the trader requests it?

Thank you very much.
[Name] — account [ID/email]
```

---

## 7. Fuentes

### Leídas hoy [V-hoy]
- TradesViz, auto-sync de prop firms vía Tradovate/NinjaTrader/Rithmic: https://tradesviz.crisp.help/en/article/how-to-auto-sync-trades-from-any-futures-prop-apex-etc-firm-via-tradovateninjatrader-or-rithmic-to-tradesviz-trading-journal-vctrgn/
- TradeZella, lista de brokers y plataformas soportadas: https://help.tradezella.com/en/articles/10055421-list-of-supported-brokers-and-platforms
- Tradovate Forum, "API Access for PropFirm Accounts" (oct-2024 → jul-2026): https://community.tradovate.com/t/api-access-for-propfirm-accounts/10348
- Affordable Indicators, automatizar daily loss limits en NinjaTrader (Account Risk Manager): https://affordableindicators.com/articles/how-to-automate-daily-loss-limits-on-ninjatrader-accounts/
- NinjaTrader Community, hilo de KosyGuard (21-mar-2026): https://discourse.ninjatrader.com/t/built-a-risk-management-add-on-that-locks-you-out-when-you-break-your-own-rules-looking-for-feedback/6186
- Tradetanto, "TraderSync alternative" (may-2026, fuente competidora): https://tradetanto.com/learn/tradersync-alternative

### Solo fragmento de búsqueda [S]
- NinjaScript Account.Flatten(): https://host1.ninjatrader.com/support/helpGuides/nt8/flatten.htm
- NinjaScript Account → ExecutionUpdate: https://ninjatrader.com/support/helpguides/nt8/executionupdate.htm
- NinjaScript Account → Executions: https://ninjatrader.com/support/helpguides/nt8/executions.htm
- NinjaScript Account class: https://ninjatrader-live.ninjatrader.com/support/helpguides/nt8/account_class.htm
- RiskMaster (NT8, gratis): https://aviramyagena.itch.io/riskmaster
- NexusFi, "Max Daily Loss Setting in NT8.1 for Prop Accounts?": https://nexusfi.com/showthread.php?t=59482
- Tradovate Forum, "Personal Lockout Request for Tradovate/Ninja Trader": https://community.tradovate.com/t/personal-lockout-request-for-tradovate-ninja-trader/12387
- PickMyTrade, Tradovate API sin $1,000 (2026): https://blog.pickmytrade.trade/tradovate-api-access-without-1000-minimum-2026-options/
- Tradetanto, "TradeZella alternative": https://tradetanto.com/learn/tradezella-alternative
- TradesViz, journal para prop firms: https://www.tradesviz.com/prop-firm-journal/
- Tradesyncer, Apex trade copier: https://tradesyncer.com/apex-trade-copier

### De la investigación previa [NV] (selección; URLs completas en el archivo de evidencia)
- Lucid, plataformas soportadas: https://support.lucidtrading.com/en/articles/11404614-supported-platforms
- Lucid, DLL LucidPro / LucidDirect / LucidDaily: https://support.lucidtrading.com/en/articles/12890122-lucidpro-daily-loss-limit · https://support.lucidtrading.com/en/articles/12890185-luciddirect-daily-loss-limit · https://support.lucidtrading.com/en/articles/16085900-luciddaily-daily-loss-limit
- Lucid, actividades permitidas (bots, copiers) y prohibidas (HFT, microscalping): https://support.lucidtrading.com/en/articles/11404728-other-activities · https://support.lucidtrading.com/en/articles/11404736-prohibited-high-frequency-trading · https://support.lucidtrading.com/en/articles/11404742-prohibited-microscalping
- Lucid, FAQ general y horarios (cierre 4:45 PM ET): https://lucidtrading.com/general-faq/ · https://support.lucidtrading.com/en/articles/11404729-allowed-trading-times
- Tradovate/NinjaTrader, Risk Settings: https://vendor-support.ninjatrader.com/s/article/Risk-Settings-Tradovate?language=en_US · https://www.tradovate.com/daily-loss-limit/
- Tradovate, Lock Risk Settings: https://tradovate.zendesk.com/hc/en-us/articles/4408927195667-How-Do-I-Lock-My-Account-Risk-Settings
- Tradovate Prop / NinjaTrader Prop, Manual Lockout: https://prop.tradovate.com/blogs/manual-lockout-tradovate-prop · https://vendor-support.ninjatrader.com/s/article/Trader-Lockout-Tradovate
- Tradovate API (spec, auth, liquidateposition, UserAccountAutoLiq): https://api.tradovate.com/ · https://docs.ninjatrader.com/api/getting-started · https://partner.tradovate.com/overview/prop-firm-management/create-and-manage-users-and-accounts
- Tradovate Forum, prop firm API: https://community.tradovate.com/t/how-can-i-use-tradovate-apis-for-prop-firm-eval-and-paid-accounts/7814 · https://community.tradovate.com/t/prop-account-api-access/10430
- ProjectX fin de terceros / TopstepX API y risk settings: https://www.financemagnates.com/forex/prop-firms-report-futures-prop-tech-provider-projectx-to-end-its-third-party-service-offering/ · https://help.topstep.com/en/articles/11187768-topstepx-api-access · https://gateway.docs.projectx.com/docs/category/api-reference/ · https://help.topstepx.com/settings/risk-settings/personal-daily-loss-limit · https://help.topstepx.com/settings/risk-settings/lock-out-customizations
- Rithmic R|API+ (costos, conformance, solo lectura de riesgo): https://www.ampfutures.com/trading-platform/rithmic-r-api · https://async-rithmic.readthedocs.io/en/latest/connection.html · https://github.com/rundef/async_rithmic/tree/main/async_rithmic/protocol_buffers · https://www.rithmic.com/products/r-manager
- R|Trader Pro, Risk Parameters set by the Trader / Liquidating Only: https://www.dojidojo.org/how-to-set-daily-loss-limits-on-rithmic-r-trader-pro · https://support.edgeclear.com/portal/en/kb/articles/setting · https://community.optimusfutures.com/t/risk-parameters-set-by-trader/4584 · https://intercom.help/quantvps/en/articles/10341640-common-ninjatrader-errors-and-how-to-fix-them
- Rithmic, una sesión por login: https://help.quantower.com/quantower/connections/connection-to-rithmic/rithmic-issues
- NinjaTrader Prop Risk Settings y add-on Account Risk Manager: https://prop.ninjatrader.com/platform/risk-settings/ · https://affordableindicators.com/ninjatrader/indicators/account-risk-manager/
- Quantower Risk Management / Quant Manager / Sierra Chart / Tradesea / PropGuard: https://www.quantower.com/release-notes · https://www.quantmanager.net/ · https://www.sierrachart.com/index.php?page=doc%2FGlobalProfitLossManagement.php · https://help.tradesea.ai/en/articles/13670130-daily-loss-profit-limits · https://propguard.cloud/
- Copiers autorizados sobre Lucid: https://tradecopia.com/lucid-trade-copier · https://crosstrade.io/docs/getting-started/prop-firm-connection-guide · https://blog.traderspost.io/article/lucid-trading-review-2025
- Lockout open source (Playwright + DNS): https://github.com/trevislee/tradovate-lockout
- Forex/CFD (MT5 EA, MetaApi, cTrader Open API, TradeLocker, DXtrade, Match-Trader, reglas de EAs): https://www.mql5.com/en/articles/23732 · https://metaapi.cloud/docs/risk-management/ · https://help.ctrader.com/open-api/account-authentication/ · https://public-api.tradelocker.com/ · https://dx.trade/traders-faq/ · https://match-trader.com/platform-api/ · https://help.fundednext.com/en/articles/8020763-is-ea-allowed-in-fundednext · https://help.fundingpips.com/hc/en-us/articles/34505029138449-Trading-Conduct-and-Security-Standards
