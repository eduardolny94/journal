# Qué dice la investigación académica y qué hacemos con ello (12-10-2026)

Revisión de la literatura (SSRN, NBER, JFE, BIS, ResearchGate y repositorios universitarios) pedida por el usuario
para mejorar la operativa swing C4L y el radar. Cada hallazgo lleva tres cosas: qué dice el paper, qué tenemos ya, y
qué se hace (medir como candidata a peso 0, según la regla de la casa en `radar-metodologia`). Las cifras de los
papers son las que ellos publican; las nuestras salen de `backtest-c4l-swing.mjs --filtros` (2024-2026, 14 pares).

## 1. Momentum en divisas: funciona, pero a 1-12 meses, no a 20 días

- **Moskowitz, Ooi y Pedersen (2012), "Time series momentum"** (58 futuros, incluidas divisas): los retornos persisten
  de 1 a 12 meses y luego revierten en parte. **Levine y Pedersen, "Which trend is your friend"**: el momentum de 12
  meses y el cruce de medias son la misma cosa escrita de dos formas.
- **Menkhoff, Sarno, Schmeling y Schrimpf (JFE 2012), "Currency momentum strategies"**: hasta 10 % anual entre
  divisas ganadoras y perdedoras; el momentum *entre* divisas (ranking) rinde más que el de cada divisa sola; los
  costes se comen parte y "hay límites al arbitraje" (no es fácil de capturar).
- **Hsu, Taylor y Wang (JIE 2016), "Technical trading: is it still beating the FX market?"**: 21.000 reglas, 30
  divisas, 45 años, corrigiendo por *data snooping*: queda predictibilidad, menor en divisas desarrolladas y menguante
  con el tiempo. **Neely y Weller**: las medias móviles simples sobre el dólar ganaron en los 70-80 y dejaron de hacerlo
  en los 90. Es decir: el cruce 8/18 *solo* no debería ganar, y en lo nuestro no gana (−0,04R).
- **Lo medido hoy:** añadir "momentum de 12 meses a favor" al cruce con la semana alineada mejora en los tres años
  (+0,13R frente a 0,00R, n=944); en contra pierde (−0,12R). Sobre "semana + radar" aporta menos (+0,24R frente a
  +0,21R) y sobre "2 de 3" es informativo (a favor 56 % / +0,68R; en contra 47 % / +0,40R, n=15). El momentum de 3 y 6
  meses no aporta nada.
- **Qué hacemos:** chip informativo "momentum 12 m" en la pestaña Swing (no cuenta para el 2 de 3 hasta tener más
  historia: el filtro necesita 250 días y 2024 casi no entra). En el radar, el submódulo de momentum usa 20 días;
  candidata a peso 0: ranking de las 8 divisas por momentum de 6-12 meses (la versión *cross-sectional* de Menkhoff).

## 2. Fundamentales macro: lo que predice es la tendencia de los datos, no el nivel

- **Dahlquist y Hasseltoft (JFE 2020), "Economic momentum and currency returns"**: la *tendencia* de cinco datos
  (producción industrial, ventas minoristas, paro, IPC, IPP) predice la divisa; comprar las de mejor momentum macro y
  vender las de peor da Sharpe 0,70 y absorbe el alfa del carry. 21 países, 1976-2017. Una réplica con la libra como
  base solo obtuvo 0,24: no es universal.
- **Colacito, Riddiough y Sarno (JFE 2020), "Business cycles and currency returns"**: las divisas de economías con
  mejor ciclo (brecha de producción) rinden más; comprar fuertes/vender débiles funciona en corte transversal y en
  serie temporal, y no lo explican carry, valor ni momentum. Es exactamente la "fase del ciclo" de Curto, con datos.
- **Molodtsova y Papell (JIE 2009)** e **Ince, Molodtsova y Papell (2015)**: los fundamentales de la regla de Taylor
  (inflación y brecha de producción relativas, con suavizado de tipos) baten al paseo aleatorio en 11 de 12 divisas; el
  diferencial de tipos a secas, la PPA y el modelo monetario lo hacen peor.
- **Lustig, Roussanov y Verdelhan (JFE 2014), "Countercyclical currency risk premia"**: el dólar sube en las malas y
  el *dollar carry* (vender dólar cuando los tipos extranjeros superan al americano) es predecible con el diferencial y
  la producción industrial de EE. UU.; se vende el dólar antes de la recesión y se recompra al salir.
- **Lo que tenemos:** pilar de crecimiento por *sorpresas* (no por tendencia), inflación por nivel, tasas, expectativas
  por el bono a 2 años (pilar que mejor funciona: es el "Taylor rule con suavizado" del mercado), y el pilar `ciclo`
  (PMI, paro, curva) como candidata a peso 0 que aún no mejoró el nivel A en los tres cortes.
- **Qué hacemos:** candidata nueva "momentum macro": pendiente de 3-6 meses de IPC, paro y PMI por divisa con las
  series FRED que ya descargamos (Dahlquist-Hasseltoft con lo que hay), y reformular `ciclo` como brecha de producción
  (Colacito) en vez de umbrales de PMI. Ambas entran a peso 0 y se juzgan con la regla de los tres cortes.

## 3. Posicionamiento (COT): débil, salvo en extremos y a 3-6 meses

- **Mulligan y Steenkamp (RBNZ, 2018)** y pruebas de causalidad de Granger en futuros: las posiciones de los grandes
  especuladores apenas ayudan a predecir la semana siguiente. Los extremos como señal contraria tienen algo de
  evidencia a 13-26 semanas; el cambio de una semana no dice nada.
- **Lo que tenemos:** pilar `posicionamiento` con percentil y marca de extremo, ya a peso bajo. Coincide con la
  literatura: no subirle el peso; sí vigilar los extremos (percentil ≥ 90 / ≤ 10) como aviso de giro, no como sesgo.

## 4. Noticias y bancos centrales

- **Andersen, Bollerslev, Diebold y Vega (AER 2003), "Micro effects of macro announcements"**: la sorpresa (dato menos
  esperado) mueve el tipo de cambio de golpe y casi todo el ajuste ocurre en los primeros minutos; las malas noticias
  pesan más que las buenas; importa que la hora de publicación sea conocida.
- **Hubert y Labondance (EER 2021)**: el tono del comunicado del FOMC explica sorpresas más allá de las previsiones y
  los votos, y **importa sobre todo en los puntos de giro del ciclo de tipos**. **Doh, Song y Yang (Fed de Kansas
  City)**: la sorpresa de texto (tono × novedad) se mide contra la reacción del bono. Un proyecto no revisado por
  pares encuentra que el tono no añade nada fuera de muestra más allá de la sorpresa de tipos: la evidencia sobre el
  dólar en concreto es fina.
- **Índices de sorpresa** (Citi, JP Morgan EASI): información direccional, in-sample del propio banco (dólar sube el 67 %
  de las veces que señala); nada independiente.
- **Lo que tenemos:** calendario con sorpresa estandarizada, `sorpresa_grande` como candidata (no adoptada), tono de
  bancos centrales manual (`cb-tone.json`) leído con la guía DCM FX, FedWatch propio, regla "nada nuevo 2 h antes".
  Coincide con la literatura: leer el bono a 2 años en los minutos siguientes, no el titular; y dar más peso al tono
  cuando el ciclo de tipos está girando (ahora, con el mercado descontando subidas tras pausa, lo está).

## 5. Sentimiento minorista y flujo

- **Estudio de flujo minorista intradía en FX (UCLan)**: los minoristas operan *contra* el movimiento reciente, no
  por las noticias; una estrategia que opera al revés que ellos es rentable: su flujo es "no informado".
- **Heimer y Simsek (JFE 2019), "Should retail investors' leverage be limited?"**: antes del tope de apalancamiento
  de 2010 en EE. UU., el operador minorista con apalancamiento alto perdía **un 44 % al mes**; el tope redujo sus
  pérdidas un 40 %. **Heimer e Imas**: el apalancamiento empeora porque permite no cerrar las pérdidas (efecto
  disposición). Es la evidencia directa sobre operar al 10-15 % por operación.
- **Lo que tenemos:** nada de sentimiento minorista. **Qué hacemos:** candidata a peso 0 con el porcentaje de
  minoristas largos/cortos por par (IG o Myfxbook, si hay fuente estable), en sentido contrario.

## 6. Stops, objetivos y tamaño

- **Kaminski y Lo (JFM 2014), "When do stop-loss rules stop losses?"**: con paseo aleatorio, el stop siempre resta
  esperanza; **con momentum, suma**. Es decir: el stop solo paga cuando la entrada tiene tendencia detrás, que es lo
  que encontramos (el cruce con radar y semana a favor gana; sin ellos, el stop es puro coste).
- **Harvey et al. (JPM 2018), "The impact of volatility targeting"**: escalar el tamaño por la volatilidad reciente
  baja las colas y sube el Sharpe en activos de riesgo, menos en divisas. **Lo medido hoy:** tamaño × (mediana del ATR
  diario de 250 días / ATR de hoy), acotado 0,25-1,5: 500 → 876 $ frente a 832 $ con "2 de 3" (DD 5,9 % frente a 4,9 %).
  Ayuda poco; no se adopta, se deja medida.
- **Krohn, Mueller y Whelan, "FX fixings: returns around the clock"**: el dólar sube antes de los *fixings* de Tokio,
  Fráncfort (14:15) y Londres (16:00) y revierte después; en horas asiáticas y europeas normales está plano. Explica
  parte de por qué la vela de las 16:00 de servidor es la peor en nuestras medidas anteriores.

## 7. Lo que la literatura NO respalda de las creencias habituales

- Que un cruce de medias sin contexto gane en divisas desarrolladas hoy (no gana; Neely-Weller, Hsu-Taylor-Wang).
- Que el COT de una semana adelante la semana siguiente (no; Mulligan-Steenkamp).
- Que el *break-even* temprano mejore el resultado (solo si hay momentum fuerte y aun así cuesta acierto: Kaminski-Lo
  y nuestra medición de −5 a −8 puntos).
- Que apalancar más acelere el crecimiento (Heimer-Simsek: acelera la pérdida).

## Plan de medición, por orden

1. **Momentum macro (Dahlquist-Hasseltoft)** como pilar candidato con las series FRED actuales. Prioridad alta: es la
   evidencia más fuerte y encaja con el método Curto que ya seguimos.
2. **Brecha de producción (Colacito et al.)** para reformular `ciclo`.
3. **Ranking de momentum 6-12 meses entre divisas (Menkhoff et al.)** como señal candidata en convicción.
4. **Sentimiento minorista contrario** si se encuentra fuente estable.
5. Pestaña Swing: chip "momentum 12 m" (hecho hoy, informativo).

Todo entra a peso 0 y se adopta solo si el nivel A mejora ≥ 2 puntos en los tres cortes temporales.

## Fuentes

- Moskowitz, Ooi, Pedersen (2012) https://papers.ssrn.com/abstract=2089463 · Levine, Pedersen "Which trend is your friend"
  https://research-api.cbs.dk/ws/files/60084063/lasse_heje_pedersen_et_al_which_trend_is_your_friend_publishersversion.pdf
- Menkhoff, Sarno, Schmeling, Schrimpf (2012) https://www.bis.org/publ/work366.pdf · Hsu, Taylor, Wang (2016)
  https://hub.hku.hk/handle/10722/229640 · Neely, Weller (resumen) https://www.cxoadvisory.com/technical-trading/foreign-exchange-market-adaptation-to-technical-trading
- Dahlquist, Hasseltoft (2020) https://research.hhs.se/esploro/outputs/journalArticle/Economic-momentum-and-currency-returns/991001480359106056
  · Colacito, Riddiough, Sarno (2020) https://causalclaims.trfetzer.com/paper/w26299.html · Molodtsova, Papell (2009)
  https://www.uh.edu/~dpapell/Taylor%20Rule%20Fundamentals.pdf · Ince, Molodtsova, Papell (2015) https://www.appstate.edu/~molodtsovat/ince_molodtsova_papell.pdf
  · Lustig, Roussanov, Verdelhan (2014) https://www.nber.org/papers/w16427.pdf · Kroencke, Schindler, Schrimpf (2014) https://revfin.org/?p=712
- Mulligan, Steenkamp (RBNZ 2018) https://econpapers.repec.org/paper/nzbnzbans/2018_2f03.htm
- Andersen, Bollerslev, Diebold, Vega (2003) https://papers.ssrn.com/abstract=313660 · Doh, Song, Yang (KC Fed)
  https://www.kansascityfed.org/documents/5642/rwp20-14dohsongyang.pdf · Hubert, Labondance (2021) https://i-cirena.ubfc.fr/node/29508
  · Blog BCE sobre tono (2023) https://www.ecb.europa.eu/press/blog/date/2023/html/ecb.blog230809~f101598a82.de.html
- Flujo minorista en FX https://clok.uclan.ac.uk/55052 · Heimer, Simsek (2019) https://papers.ssrn.com/abstract=3095136
- Kaminski, Lo (2014) https://dspace.mit.edu/entities/publication/bb69ca4b-0cdc-487f-831d-63b2e84fafee · Harvey et al. (2018)
  https://alphaarchitect.com/volatility-targeting-improves-risk-adjusted-returns/ · Krohn, Mueller, Whelan (fixings)
  https://www.wu.ac.at/fileadmin/wu/d/ri/isk/VSFX_2022/Paper/Session_III_1a_Krohn__foreign_Exchange_Fixings_Returns_Around_The_Clock_0712.pdf
