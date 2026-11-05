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
- **Decisión (19:00):** mantiene 3,75–4,00 %, votación **10–2** (Cook y Hammack querían subir 25 pb). Comunicado: actividad
  «expandiéndose a un ritmo fuerte» (antes «sólido»), inflación «elevada», esperará más información. Rueda de prensa
  (Warsh): «no creo en la forward guidance salvo circunstancias extremas», «no prejuzgo reuniones»; el endurecimiento de
  las condiciones financieras desde septiembre es «modesto»; menos reuniones a partir de 2027.
- **Descontado después:** CME FedWatch diciembre subida **85 %** (78 % el día antes); lectura automática del radar 95,8 %
  (futuros 2026-12; no se movió). No hay reunión en noviembre: la siguiente es el 8–9 de diciembre.
- **Reacción (19:00 → 22:55 Madrid):** 2 años 4,74 → **4,71 %** (−3 pb); 10 años **5,02 → 5,045 %** (sube: curva se
  empina); DXY 102,32 → 102,13 (−0,18 %, por debajo del mínimo del día previo a la decisión); EURUSD +15 pips (1,1157);
  USDCHF 0,8296 → 0,8276 (−20 pips); oro +0,7 % (4.081); Nasdaq −0,4 %; petróleo −0,7 %.
- **Lectura:** mantener con dos disidentes halcones es halcón en el papel, pero sin compromiso con diciembre y con
  «modesto» el mercado lo leyó como *menos* halcón de lo descontado: tramo corto abajo, dólar abajo, oro arriba. El
  tramo largo sube por prima de plazo (empinamiento), no por la Fed: no ayuda al dólar. **Tono manual: +1 halcón, sin
  cambio** (la dirección sigue siendo subida en diciembre; el matiz es que la Fed no la ha prometido).
- Próximo catalizador real: nóminas (6-nov) e IPC de octubre; diciembre se decide con datos, no con discursos.

## 2026-10-29 · PIB 3T y PCE de EE. UU. (13:30) + BCE (14:15, Lagarde 14:45)

- Descontado antes: PIB 3,2 %, PCE subyacente 0,3 % m/m; BCE mantiene (depósito 2,50 %), diciembre subida ~60–65 %.
  Fed diciembre 85 % (CME) tras la reunión de ayer. EURUSD 1,1159 al cierre de ayer, radar EUR −3,3 (la más débil),
  fondos cortos de EUR en percentil 2.
- **Datos:** PIB **3,4 %** (cons. 3,2; sorpresa a favor del dólar), PCE subyacente 0,3 % m/m = consenso (3,1 % a/a),
  general 0,5 % (3,6 % a/a), renta 0,2 % (cons. 0,3). Reacción 1.ª hora: EURUSD −27 pips hasta **1,1114** (justo el
  mínimo de 20 días anotado ayer), DXY 102,28, oro −30 $. Bonos no acompañaron (10 a 5,045 → 5,00): dólar por
  crecimiento, no por tipos.
- **BCE:** mantiene (depósito 2,50 %, refi 2,65 %), **unánime**, pero Lagarde: «el Consejo debatió si era apropiado subir»
  (pausa halcón); inflación 3,8 % «máximo de 3 años», subyacente estable; «tenemos instrumentos» ante la deuda francesa
  (rendimientos franceses en máximos desde 2002) sin anunciar nada; **Lagarde se va el 7-02-2027**, nueve meses antes.
  Diciembre BCE: 67 % de subida tras la rueda de prensa.
- **Reacción al cierre (19:30 Madrid):** EURUSD **1,1114 → 1,1169** (+55 pips desde el mínimo, +10 en el día), DXY
  **101,96** (mínimo del día y por debajo del cierre post-Fed), USDCHF 0,8289 → **0,8261**, GBPUSD 1,3366 (+39),
  **oro 4.020 (−47 $ en el día, mínimo 4.017)**, 10 años **4,99 %** (−6 pb). El rebote del euro anunciado ayer se dio
  desde el nivel exacto (1,1114) y por el motivo previsto (BCE halcón), tras el susto del PIB.
- **Lectura:** dólar sin catalizador propio hasta nóminas (6-nov) y con el 10 años cayendo; el euro gana apoyo de tipos
  (BCE «debatió subir»); el oro cae con bonos bajando → flujo/posicionamiento, no tipos. Radar tras la actualización
  automática: USD +1,83 (antes +2,55), EUR −1,89 (antes −3,31), CHF −2,25; **FedWatch automático diciembre 81,7 %**
  (antes 95,8 %). **Tono manual BCE: +1 halcón** (pausa con debate de subida); Fed sin cambio.
- Los datos entraron en `radar_calendar` con la actualización de las 20:25 (actual = real).

## 01-11-2026 · Verificación de tasas y tono por banco (fuentes oficiales)

| banco | tasa oficial | radar antes | radar ahora | tono |
|---|---|---|---|---|
| Fed (28-10) | 3,75–4,00 % (10–2, Cook y Hammack por subir) | 4,00 (techo) | 4,00 | +1 ✓ |
| BCE (29-10) | depósito 2,50 %, refinanciación 2,65 % | **2,65 (refinanciación)** | **2,50 (depósito)**, como el BIS y FRED desde 09-2024 | +1 ✓ (riesgos al alza por energía) |
| BoE (17-09) | 3,75 % (6–3, tres por subir a 4 %) | 3,75 | 3,75 | +1 ✓ |
| BoJ (30-10) | 1,25 % (mantiene; la web del BoJ no sirve el texto, fuentes secundarias 8–1 con un voto por subir) | 1,25 | 1,25 | +1 (noticias) |
| BNS (24-09) | 0 % | 0 | 0 | 0 ✓ |
| BoC (28-10) | 2,50 % (+25 pb, «could be a need to increase further») | 2,50 | 2,50 | +1 ✓ |
| RBA (29-09) | 4,60 % (+25 pb, «increasing further if needed») | 4,60 | 4,60 | **0 → +1 manual** (RSS bloqueado; la automática solo vio la decisión) |
| RBNZ (28-10) | 2,75 % (mantuvo con 3,00 % esperado, 4–3) | 2,75 | 2,75 | −1 ✓ |

Bonos a 2 años al 29-10 (fuentes oficiales, frescos): USD 4,61 · EUR 3,01 · GBP 4,92 (gilt a 5 años) · JPY 1,90 · CHF 0,24 ·
CAD 3,36 · AUD 4,94 · NZD 3,80 (TradingView). Próximas: RBA 03-11 (consenso 4,85 %), BoE 05-11 (consenso 4,00 %).

## 03-11-2026 · RBA sube a 4,85 % (6–3), ISM 55,5, IPC suizo 1,5 %, elecciones de medio mandato

**RBA (04:30 España).** Descontado: subida de 25 pb a 4,85 % (consenso 4,85). Texto (mr-26-30): sube, pero **6 votos a 3**
(tres por mantener en 4,60), inflación «todavía alta y extendida», revisa al alza la inflación (por encima del 3 % el próximo
año, vuelta al techo del 2–3 % a finales de 2027), paro subiendo más de lo previsto, vivienda cayendo; la guía pasa de
«increasing further if needed» (septiembre) a «hará lo que considere necesario» y «bien situada para responder»: dependencia
de datos, sin anunciar más subidas. Confirmación: AUD cae a mínimos de dos semanas, AUDUSD bajo 0,70, AUDJPY y AUDNZD a
la baja; la prensa lo lee como posible pausa (TD: «RBA pause may weigh on AUD into year-end»). **Tono AUD: +1 automático con el comunicado** (subida descontada y previsión de inflación al alza; el matiz: tres disidentes por
mantener y sin guía de más subidas, por lo que el mercado descuenta pausa y el AUD cae). Desde hoy el RSS del RBA vuelve a ser
accesible y el BNS se lee por la URL de cada evaluación: la lectura automática ya no depende solo de la decisión y los titulares.

**ISM manufacturero (ayer 16:00): 55,5 frente a 54,5.** Dato de actividad: mueve la hora, no la tendencia (medido). Apoya
el relato de economía fuerte y Fed sin recortes; el dólar no reaccionó por las elecciones.

**IPC suizo (08:30): 1,5 % frente a 1,3 %, anterior 1,0 %.** Segunda sorpresa suiza seguida (PMI 56,7 ayer). El franco es la
divisa que más sube en dos días; el BNS a 0 % con inflación subiendo. Para USDCHF: el fundamental sigue a favor del dólar
(tasa 4,00 frente a 0), pero el radar en el franco acierta la semana el 46 %: no es par para seguir el sesgo.

**Elecciones de medio mandato (hoy; resultados en la noche europea).** Descontado: Cámara demócrata 93 %, Senado 71 %. El
escenario con movimiento es la sorpresa republicana (dólar arriba). Histórico: S&P +1,1 % al día siguiente (79 %), 100 %
positivo a 12 meses; dólar sin patrón por partido.

**Pendiente:** JOLTS 16:00; BoE jueves (consenso 4,00 %); NFP viernes (consenso 65 mil).

**Radar tras los datos (local, 09:48):** USD 2,9 · CAD 1,5 · GBP 0,9 · AUD 0,3 · EUR −0,2 · JPY −1,1 · CHF −1,9 · NZD −2,6.
USDCHF +4,8 y USDJPY +4,0 fuertes (USDJPY nivel A, 60 % a 5 d); EURUSD −3,1 moderado; GBPUSD, USDCAD, EURGBP, EURJPY y
AUDJPY sin sesgo. VIX 21,7, S&P −3 % en 20 días: riesgo en modo refugio, apoya USD y pesa sobre AUD y NZD.

## 2026-11-04 / 05 · Resultado de las elecciones de medio mandato: ola demócrata (Cámara y Senado)

- **Descontado antes:** Cámara demócrata 93 %, Senado 71 %. El Senado era la parte no descontada del todo.
- **Resultado:** los demócratas ganan las dos cámaras. Congreso demócrata con presidente republicano = bloqueo legislativo.
- **Confirmación de mercado (orden de la guía: bonos → dólar → oro/Nasdaq → petróleo):**
  - Bono a 10 años: baja ~7 pb, a ~4,87 % (4,95 % el 03-11). El 2 años apenas se mueve: **FedWatch sigue dando 82 % de
    subida en diciembre**. Baja la parte larga, no la expectativa de la Fed.
  - Dólar: DXY −0,5/−0,6 %, a ~101,3, mínimo de un mes. EURUSD 1,1232, libra en máximos de siete semanas.
  - Oro: +3,4 % el miércoles (mayor subida diaria desde el 19-08) y +1,9 % el jueves, hasta 4.134 $, máximo de dos semanas.
    Sigue −7 % en el año. Plata también arriba.
  - Nasdaq: futuros −0,5 % de madrugada por el miedo a más regulación de la IA; cierra +0,83 %.
  - **Petróleo: WTI −9 %** por la expectativa de fin de la guerra con Irán. Es el motor que más pesa en la parte larga
    de la curva (menos inflación esperada).
- **Lectura:** no es «Fed más suave» (la subida de diciembre sigue descontada), es **menos prima de inflación y de gasto
  en los bonos largos** (petróleo −9 %, bloqueo = menos estímulo fiscal) → tipos reales abajo → dólar abajo → oro arriba.
  El oro venía castigado todo el año por tipos altos; al aflojar los tipos largos, rebota con fuerza.
- **Financiación del gobierno:** la prórroga vigente llega hasta el **11 de diciembre** (no de noviembre); el Congreso
  vuelve el 9-11 para la sesión de final de legislatura. El riesgo de cierre es de diciembre.
- **Radar:** tenía dólar fuerte y oro bajista (por el dólar). El movimiento va en contra: es un evento, y el radar es un
  sesgo semanal de 54 %. El pilar de riesgo y el de materias primas (petróleo −9 %) lo irán recogiendo; no se toca a mano.
- **Pendiente:** BoE hoy 13:00 (4,00 % descontado, 7–2); empleo de EE. UU. viernes 14:30 (65 mil).

## 2026-11-05 · Banco de Inglaterra (13:00 España) y jornada de tensión (VIX 28)

- **Descontado antes:** subida de 25 pb a 4,00 % al 94–100 %; votación esperada 7–2; 3–4 subidas más en 2027.
- **Texto (fuente primaria, resumen y actas del BoE):** sube a 4,00 % por **8 a 1**; la disidente (Mann) pedía +50 pb. Hay
  «suficiente presión inflacionista en camino» por la energía; prevé inflación cerca del 5 % a mediados de 2027; la
  política «no sigue una senda prefijada». Bailey: no es la primera de una serie inevitable, pero otra subida no es
  improbable si no se resuelve el conflicto de Oriente Medio. Próxima reunión 17-12.
- **Lectura:** la subida estaba descontada; la sorpresa es pequeña y halcona (casi unanimidad y una disidencia por más).
  **Tono GBP: +1 automático con el comunicado.**
- **Confirmación:** GBPUSD 1,3434 → 1,3448 (plano); EURGBP 0,8342 → 0,8339. Sin movimiento: lo descontado no mueve.
- **Riesgo:** VIX 28,2 (régimen de tensión), S&P −5,3 % en 20 días; el radar marca US500 y NAS100 bajistas fuertes. El modo
  refugio apoya USD y JPY y pesa sobre GBP, AUD y NZD: por eso GBPUSD sigue bajista moderado pese al BoE halcón.
- **Radar (corregido hoy):** tasa GBP 4,00 % (antes se quedaba en 3,75 % por un fallo de lectura del calendario).
  USD +3,7 · JPY +0,9 · EUR +0,4 · GBP +0,3 · CHF −0,3 · AUD −1,0 · CAD −1,9 · NZD −3,8.
- **Pendiente:** empleo de EE. UU. viernes 14:30 (65 mil).
