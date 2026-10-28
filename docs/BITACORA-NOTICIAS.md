# Bitácora de noticias macro · lo que pasó y lo que aprendimos

Una entrada por publicación relevante (actas, decisiones, discursos, datos que el usuario señale), con la misma
plantilla, para ir construyendo criterio por tipo de noticia. La lectura sigue [LECTURA-FED.md](LECTURA-FED.md):
primero lo descontado, luego el texto, luego la confirmación del mercado. Lo que entra en el radar por esta vía es
solo el **tono del banco central** (pilar «tono», peso 5), escrito en `server/src/radar/data/cb-tone.json` con la nota,
la fecha (`as_of`) y la caducidad (`until`): al desplegar, el radar lo aplica a **todos los usuarios**; un ajuste hecho a mano
en Radar → Ajustes después de esa fecha prevalece. Los pesos y las condiciones del modelo no se tocan sin medirlos
(skill `radar-metodologia`).

Plantilla: **Descontado** · **Texto** (recuentos: all/most/many/several/some/a few) · **Reacción** 1 h y 24 h ·
**Lectura** · **Qué se cargó en el radar** · **Lección**.

---

## 2026-10-07 · Actas del FOMC (reunión 15-16 sep 2026) · USD

- **Descontado antes** (FedWatch propio): 28-oct mantener 82 %, 9-dic subida 25 pb al 76 %. Tras la reunión de
  septiembre la subida de octubre se descontaba al 70 %; el PCE subyacente del 3,0 % y las nóminas de +29.000 la
  bajaron al 20 % antes de las actas. 10 años 5,30 % (subasta, máximo de 24 años), DXY 102,2, oro 4.136, Nasdaq en
  máximos, WTI 88, VIX 15.
- **Texto** (fuente: federalreserve.gov, fomcminutes20260916):
  - Subida de 25 pb a 3,75-4,00 % por unanimidad (12-0), primera desde 2023.
  - Inflación: «remained elevated», sin progreso suficiente en los últimos meses (PCE 3,8 %, subyacente 3,4 %).
    Riesgos «skewed to the upside»; *some* dicen que más sesgados que antes. *Several* temen que cinco años por encima
    del 2 % acaben moviendo las expectativas.
  - Empleo: estable y cerca del pleno (paro 4,1 %); *a majority* lo ve algo más fuerte; *several* ven poco dinamismo
    (pocas contrataciones y pocos despidos). Riesgos del empleo equilibrados.
  - Tipos: ***most* participants: otra subida probablemente apropiada antes de fin de año**, cada reunión «with an
    open mind», según los datos.
  - Presiones citadas: energía (*many*: cuanto más dure cara, más riesgo de contagio), aranceles (*some*), IA (*several*:
    el despliegue sigue sorprendiendo al alza y presiona precios). Dólar ponderado depreciado entre reuniones.
  - Staff: crecimiento por encima del potencial hasta 2028, paro bajo, inflación hacia el 2 % solo en 2029; perspectiva
    más fuerte que en julio.
- **Reacción** (medida con Yahoo): 1 h: DXY +0,01 %, 10 años −1,3 pb, oro −0,1 %, Nasdaq 0,0 %, VIX −0,5 %.
  24 h: DXY +0,13 %, 10 años −0,7 pb, oro +0,4 %, Nasdaq +0,15 %, WTI +4,0 %, VIX +3,5 %.
- **Lectura**: texto restrictivo pero anterior a los datos flojos; el mercado ya lo tenía descontado, así que no hubo
  repricing. Lo que se mueve al día siguiente es el petróleo (+4 %) y el VIX, no la Fed. El oro rebota sin
  confirmación de bonos ni dólar.
- **Qué se cargó en el radar**: expectativa USD 28-oct (mantener 82 %) desde el FedWatch propio; tono USD **+1** (halcón
  moderado) en `cb-tone.json` hasta el 28-oct, para todos los usuarios; nota de la semana 41 en Semana.
- **Lección**: unas actas de una reunión ya "superada" por los datos no mueven nada aunque suenen duras. Lo operable
  está en la probabilidad de diciembre: si cae por debajo del 50 %, el dólar pierde el motor; si sube, confirma.
  Próxima comprobación: decisión del 28-oct y datos de inflación de octubre.

## 2026-10-14 · CPI de EE. UU. de septiembre (previo al dato, 14:30 Madrid)

- Consenso: general 0,6 % m/m (ant. 0,4 %), 3,6 % a/a (ant. 3,4 %); subyacente 0,2 % m/m (ant. 0,3 %), 2,5 % a/a (ant. 2,4 %).
- Descontado antes: 2 años en 4,72 %, FedWatch propio 28-oct mantener 82 %, dic subida 25 pb 76 %. Dólar la divisa más
  fuerte del radar (+2,95), euro la más débil (−2,81); DXY +1,9 % en 20 d, EURUSD 2,5 ATR bajo su media 20 (sobreextendido).
- Lectura previa (docs/LECTURA-IPC.md): la barra del consenso es alta (salto de 0,4 a 0,6); riesgo asimétrico hacia
  sorpresa fría. Regla medida: la 1.ª vela sigue la sorpresa 76 %; el resto del día no la continúa (39 %).
- Guía DCM FX "IPC y el oro" leída y contrastada: sorpresa > nivel (cierto), primer latigazo engaña (cierto),
  subyacente decide y CPI caliente hunde el oro (no confirmados en 2024–2026).
- Pendiente: anotar dato, sorpresa y reacción (dólar, 2 años, oro) al cierre.
- Aplicado de la guía: lectura combinada general+subyacente en `ultima_sorpresa` (mejora el nivel A en los tres cortes),
  tarjeta "Lectura del dato" en el Panel y registro FedWatch antes → después.
- **Dato (14:30):** general 0,6 % m/m (= consenso), 3,7 % a/a (cons. 3,6 %); subyacente 0,3 % m/m (cons. 0,2 %, z +1,06),
  2,6 % a/a (cons. 2,5 %). Lectura del radar: **caliente** (3 de 4 componentes por encima, ninguno por debajo).
- **Reacción 1.ª hora (parcial, 14:37):** dólar arriba en los 7 pares, media +0,69 ATR: EURUSD −54 pips (1,1142),
  GBPUSD −49, USDCHF +44, USDJPY +36, USDCAD +35. Con la sorpresa, como el 76 % de las veces.
- Radar tras el dato: USD +3,59 (antes +2,95), EUR −2,92; EURUSD −6,5 nivel C. El sesgo de fondo se refuerza; la
  operación sigue sin cumplir el checklist (nivel C, extensión). Tono Fed (+1 halcón) coherente, sin cambio.
- Pendiente: FedWatch antes → después (relectura automática a las 14:50) y cierre del día.
- **Reacción hora completa:** dólar +1,10 ATR de media en los 7 pares: EURUSD −75 pips, GBPUSD −94, USDCAD +79, USDCHF +54,
  USDJPY +50, AUDUSD −49, NZDUSD −41.
- **FedWatch antes → después:** subida el 28-oct 18 % → **46 %** (mantener 82 % → 54 %, +12 pb descontados). El dato sí
  movió las expectativas de la Fed: no es solo flujo. La expectativa manual del 7-oct queda sustituida por la automática
  (regla nueva: tras un dato grande, la lectura posterior prevalece sobre una manual anterior al dato).
- Radar: USD +3,66. Lectura de la semana: dólar fuerte confirmado por datos y por tipos; el checklist swing sigue sin
  par válido (EURUSD nivel C y extendido tras el movimiento).

## 2026-10-28 · Decisión de la Fed (19:00 Madrid, rueda de prensa 19:30; sin proyecciones ni dot plot)

- Tipo actual 3,75–4,00 % (última subida en septiembre). Contexto: IPC sept. 3,7 % a/a (subyacente 2,6 %), NFP +29 k.
- Descontado antes: hoy **mantener ~90 %** (subida 4–10 % según Kalshi/Polymarket/OIS); **diciembre subida 25 pb**:
  lectura automática del radar 95,8 % (futuros de fondos federales 2026-12, 06:41 UTC), CME FedWatch ~80 %, Reuters
  100/100 economistas. Bono 2 años 4,74 % («descontado subida»). Radar: USD +2,55 (2.º más fuerte), CHF −2,96, EUR −3,31;
  USDCHF alcista fuerte, diff +5,5, p5 59, confianza 92. VIX 17,4 (calma). SNB en 0 % desde sept. y dispuesto a
  intervenir contra la fortaleza del franco.
- Asimetría: el tono halcón (subida en diciembre) ya está en precio; lo que no está en precio es una Fed que dude de
  diciembre por el empleo (NFP 29 k). Escenarios en la respuesta al usuario (largo en USDCHF).
- Pendiente: texto del comunicado, confirmación 2 años → DXY → oro/Nasdaq → petróleo, FedWatch antes → después y tono
  manual con nota.
