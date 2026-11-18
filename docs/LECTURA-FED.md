# Cómo leer una publicación de la Fed (actas, decisión, discurso) · 07-10-2026

Resumen de la guía «Actas del FOMC» de @dcm_fx (7 de octubre de 2026) que el usuario pidió tener en cuenta para
cualquier noticia de este tipo. Complementa a [METODO-LECTURA-SEMANAL.md](METODO-LECTURA-SEMANAL.md) (lo descontado
antes de la semana) y a [IMPACTO-EVENTOS.md](IMPACTO-EVENTOS.md) (sorpresa medida en pips). Material educativo, no
asesoramiento.

## 1. La pregunta correcta

No es «¿qué dicen las actas?» sino **«¿son más o menos restrictivas de lo que el mercado ya había descontado?»**.
Una frase muy dura puede hacer subir la bolsa si el mercado esperaba algo todavía más duro. Las actas no son una
decisión nueva: explican cómo se llegó a la anterior.

## 2. Qué buscar en el texto

| Qué mirar | Lectura más restrictiva | Lectura más relajada |
|---|---|---|
| Inflación | persistente, riesgos al alza | moderándose, mejor balanceada |
| Tipos | más subidas o altos más tiempo | paciencia, menos necesidad de endurecer |
| Empleo | demasiado resistente | enfriamiento claro |
| Condiciones financieras | no suficientemente restrictivas | ya están frenando la economía |
| Balance de riesgos | domina la inflación | crecimiento y empleo ganan peso |

No se cuentan palabras: se buscan cambios de énfasis, cuántos miembros defendieron cada postura y qué datos
condicionarían el siguiente movimiento.

## 3. La cadena de transmisión

La Fed no mueve el oro ni el Nasdaq directamente. El orden es:

**Expectativas de tipos → bonos (2 y 10 años) → dólar (DXY) y condiciones financieras → oro / duración (Nasdaq) → petróleo y riesgo**

- Más *hawkish*: expectativas ↑, yields ↑, USD ↑, coste de oportunidad del oro ↑ → presión sobre oro y Nasdaq.
- Más *dovish*: lo contrario → apoyo a oro y duración.
- Nunca como ecuación mecánica: si los tipos suben porque la economía está fuerte, la bolsa puede aguantar; si suben
  por inflación o riesgo fiscal, la reacción cambia. **El porqué del movimiento importa.**

## 4. Dos escenarios y su confirmación

| Activo | A · más hawkish de lo esperado | B · menos hawkish de lo esperado |
|---|---|---|
| US2Y / US10Y | suben | caen |
| DXY | sube | cae |
| Oro | cae | recibe apoyo |
| Nasdaq | presión por mayor tasa de descuento | puede beneficiarse |
| Brent | importa si mantiene la presión inflacionaria | sigue siendo un riesgo si mantiene la inflación |

**Si el titular dice una cosa y bonos + dólar dicen otra, manda el repricing del mercado, no la frase.**

## 5. Checklist de 10 minutos

| Momento | Qué se hace |
|---|---|
| Antes | Marcar máximos/mínimos y niveles. Anotar el consenso de tipos (FedWatch). Mirar 2Y, 10Y, DXY, XAU, NDX/SPX y Brent. |
| 0-2 min | No concluir por la primera vela. Leer titulares y ver qué mercado reacciona primero. |
| 2-5 min | Confirmación: ¿2Y y 10Y se mueven juntos? ¿Confirma el DXY? ¿El oro hace lo esperable? |
| 5-10 min | Divergencias: titular hawkish con yields cayendo = preguntar qué estaba ya descontado. |
| Después | Actualizar escenario y niveles. Una reacción intradía no es una tesis de meses. |

Orden de lectura: 1 expectativas de la Fed · 2 bonos · 3 dólar · 4 oro / equity · 5 petróleo y riesgo.

Las 7 preguntas que hay que poder responder: qué esperaba el mercado; si cambió la probabilidad del siguiente
movimiento; qué hace el 2 años; qué hace el 10 años y por qué; si confirma el DXY; si oro y Nasdaq son coherentes con
los yields; si el petróleo cambia la lectura de inflación.

## 6. Regímenes que resume la guía

- Yields ↑ + DXY ↑ + Brent firme + equity aguanta → crecimiento/reflación con condiciones restrictivas: el oro tiene
  competencia.
- Yields ↓ + DXY ↓ + equity pierde momentum / riesgo ↑ → mejora el argumento relativo del oro y la duración.
- Señales contradictorias → no hay obligación de tener opinión inmediata.

## 7. Qué hace ya el radar y qué no (07-10-2026)

Ya cubierto:

- Lo descontado: FedWatch propio con futuros de fondos federales (`server/src/radar/sources/fedwatch.js`) y regla del
  método semanal (≥ 85 % = descontado, la sorpresa sería que no ocurra).
- Bonos a 2 años por divisa (`sources/yields.js`, pilar «expectativas»); tipo real y breakeven a 10 años (FRED).
- DXY, VIX y petróleo WTI (`CL=F`) como series de mercado; oro, S&P 500 y Nasdaq 100 como instrumentos con pilares de
  tipos reales, dólar, riesgo, macro y expectativas Fed (`instruments.js`).
- «FOMC Minutes» cuenta como impacto alto (`effectiveImpact`) y aparece en «Noticias fuertes».
- Backtests: solo la reacción a la Fed tiene seguimiento operable; la primera vela de CPI/NFP no se persigue.

No cubierto (candidatos; si entran, con peso 0 y medidos según la skill `radar-metodologia`):

- Lectura automática tras la publicación: coherencia 2Y/10Y + DXY + oro + Nasdaq (confirmación frente a divergencia).
- Bono nominal de EE. UU. a 10 años (hoy solo 2 años nominal, 10 años real y breakeven) y Brent además de WTI.
- Checklist pre/post evento en la ficha del evento (ImpactCard) para actas y discursos, que hoy no tienen β calibrada.

## Lectura automática de noticias (18-11-2026)

Pedido de César: que las actas y las noticias de alto impacto se lean solas y quede escrito «qué salió y qué esperar»
para **USD, EUR, GBP, CHF y CAD**. Código: `server/src/radar/lecturas.js` (tabla `radar_lecturas`), pruebas en
`server/scripts/test-lecturas.mjs`, tarjeta «Lectura de noticias» en Radar → Panel (`LecturasCard.tsx`).

- **Cuándo corre:** cada 5 minutos dentro del ciclo del radar (y el calendario se lee cada 2 minutos al salir un dato).
- **Datos de alto impacto:** reglas fijas. Sorpresa de cada componente → a favor / en contra / en línea / mixta. Si el
  titular sale en línea pero los componentes de impacto medio de la misma hora y del mismo tipo van todos a un lado, se
  marca «ligeramente a favor / en contra». Se añade lo medido para ese tipo de dato (898 datos, 2023–2026: inflación
  77 % la primera hora y 59–61 % a 5–20 días; empleo 72 % y 51–56 %; actividad 58 % y 50 %) y si el bono a 2 años de
  esa divisa lo confirma ese día (≥ 2 pb en el mismo sentido). Se reescribe durante 24 h para recoger el bono.
- **Actas** (FOMC Minutes, cuentas del BCE, actas del BoE y del BNS, deliberaciones del BoC): 5 minutos después de la hora
  del calendario se busca el texto oficial (Fed y BCE por su RSS; en la Fed se sigue el enlace de la nota de prensa a las
  actas completas y se lee desde «Participants' Views») y Claude lo lee con el método de este documento: ¿más o menos
  duras que lo descontado (FedWatch), y lo confirma el bono? Devuelve tono −2…+2, resumen y «qué esperar». Sin clave de
  Anthropic o sin texto: regla con el bono a 2 años (≥ 3 pb), reintentada cada 30 minutos durante 48 h.
- **No cambia la puntuación del sesgo.** Es lectura para el trader; el tono que sí puntúa sigue saliendo de las decisiones
  (`sources/tono.js`).
- Probado con las actas del 7-10-2026: «algo más duras de lo descontado → a favor del dólar… el efecto debería ser
  pequeño» (el bono se movió +1 pb), que coincide con la lectura manual de la bitácora.

## Rueda de prensa y comparación con el comunicado anterior (18-11-2026)

El tono automático (`server/src/radar/sources/tono.js`, pilar «Tono», −2 a +2) ahora, tras cada decisión de la Fed:
1. Lee el comunicado y las proyecciones, como antes.
2. Lo compara con el comunicado de la reunión anterior (todos los bancos con comunicado; la Fed con URL directa si el RSS ya no la trae).
3. En cuanto la Fed cuelga la transcripción de la rueda de prensa de su presidente (`FOMCpresconfAAAAMMDD.pdf`, unas horas después),
   relee todo con el PDF adjunto (una sola vez, hasta 4 días tras la reunión) y actualiza el tono. La nota queda como
   `auto AAAA-MM-DD (comunicado+rueda, modelo): …`.
Sin tarjeta nueva: solo cambia el número del pilar Tono del dólar (peso 5). Un tono puesto a mano después manda. Sin clave de
Claude solo se aplica la regla simple. Prueba real sobre la reunión del 28-10-2026: tono +1 con y sin rueda (41.400 tokens de entrada
con el PDF, ≈ 2.000 sin él). Pruebas: `server/scripts/test-tono.mjs`. Por ahora solo la Fed tiene rueda de prensa.
