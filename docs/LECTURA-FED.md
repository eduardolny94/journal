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
