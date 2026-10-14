# Cómo leer el IPC: la guía de DCM FX contrastada con nuestros datos (14-10-2026)

Fuente: "IPC de EE. UU. y el oro", informe de 12 páginas de DCM FX (Daniel Curto) del 14-10-2026, previo al dato.
Contraste: `server/scripts/ipc-oro.mjs` (27 CPI desde jun-2024 con oro; 31 con la cesta dólar) y `cpi-londres.mjs`.

## Lo que dice la guía (resumen fiel)

1. **Lo que mueve no es el nivel, es la sorpresa** frente al consenso. Un 3,6 % anual "en línea" no es por sí solo
   venta de oro.
2. **El subyacente mensual decide el tono.** Mismo titular (3,6 %), lecturas opuestas: con 0,2 % subyacente es
   "menos restrictivo"; con 0,4 % es "problema para la Fed".
3. **Tres fases tras el dato:** reacción impulsiva (segundos: liquidez y algoritmos), revisión de tipos (minutos:
   US02Y, DXY, futuros), aceptación del precio (5–30 min). "No confundir el primer latigazo con una tendencia."
4. **Caso de estudio del 11-sep:** oro +0,29 % → −1,14 % → +2,38 %. La primera reacción no anticipó el movimiento.
5. **Canales de transmisión:** US02Y (Fed más dura), US10Y real (coste de oportunidad del oro), DXY (confirmación
   direccional), FedWatch (antes contra después).
6. **Matriz de escenarios para el oro** (general a/a × subyacente m/m): ≥ 3,8 % y 0,3–0,4 % → bajista si US02Y/DXY
   confirman; 3,6–3,7 % y 0,3 % → bajista o volátil; 3,6 % y 0,2 % → mixto, riesgo de falsa ruptura; 3,4–3,5 % y
   0,2 % → posible alivio alcista; ≤ 3,3 % y 0,1 % → alcista con confirmación.
7. **Protocolo a las 14:30:** antes (captura de FedWatch y rendimientos, niveles, riesgo máximo, spread), después
   (sorpresa exacta, US02Y y DXY, tramo inicial, mínimo/máximo a 5 y 15 min, nota causal).
8. Contexto del mes: PCE de agosto por debajo del consenso (4 registros), Michigan en línea, importación e ISM
   precios por encima; energía como principal riesgo de septiembre.

## Lo que dicen nuestros datos

| Afirmación de la guía | Medido (2024–2026) | Veredicto |
|---|---|---|
| Lo que mueve es la sorpresa | 1.ª vela del dólar con la sorpresa: 70–76 %; día: 55–77 % | **Cierto** |
| El primer latigazo no anticipa | Oro: la 1.ª vela se continúa el 48 % del resto del día y el 46 % mañana; dólar: 39 % | **Cierto** |
| El subyacente decide el tono | Dólar en el día: general m/m 77 % (13), general a/a 75 % (16), subyacente m/m 59 % (17). Casos con general y subyacente opuestos: 0 | **No confirmado**: en lo medido el general predice igual o mejor; la situación "mismo titular, núcleo distinto" no ha ocurrido |
| IPC caliente → oro abajo | Con IPC caliente el oro **subió** en el día el 86 % (6/7) y al día siguiente el 71 %; con IPC frío subió el 69 % | **Falso en este ciclo**: el oro subió casi siempre en días de CPI (tendencia alcista 2024–2026); el CPI no manda sobre el oro |
| Confirmar con DXY | 1.ª vela del oro coherente con el dólar (21 casos): continúa el 48 %; incoherente (6): 50 % | **Sin valor** con velas de 1 h (US02Y intradía no disponible) |
| La reacción de la 1.ª hora informa de los días siguientes | Dólar: 48 % mañana y 48 % a 5 días; la sorpresa en sí: 60 % mañana, 55 % a 5 días | La reacción no; la sorpresa, algo |

- Lo que funciona de la guía es lo que ya medimos: **sorpresa > nivel** y **desconfiar del primer impulso**.
- La matriz de escenarios del oro no se sostiene en 2024–2026: el oro subió el 69–86 % de los días de CPI, fuera
  cual fuera el dato. Para el oro pesan más los flujos de reservas y el refugio que un IPC.
- "Confirmación" en tiempo real (US02Y, FedWatch antes/después) no la podemos medir con datos gratuitos: el protocolo
  es razonable como disciplina, pero sin evidencia estadística, como la propia guía reconoce ("precedente cualitativo").
- Tamaño: en días de CPI el oro mueve 0,19 ATR en la 1.ª vela y 0,36 ATR en el día; el dólar, 0,46 y 0,53.

## Qué aplica el radar (ya) y qué cambia

- **Ya:** sorpresa estandarizada frente al consenso por indicador (`surpriseOf`, con z-score histórico), `ultima_sorpresa`
  como condición del modelo de convicción, `sorpresa_grande` medida (no adoptada), aviso "nada nuevo 2 h antes",
  aviso de reacción en contra en la 1.ª hora, FedWatch propio antes y después.
- **Ya en el oro:** pilar de tipos reales (lo que la guía llama "US10Y real") en `instruments.js`.
- **Cambio de criterio:** el aviso "reaccionó en contra del sesgo" se queda informativo; medido, la reacción de la
  1.ª hora no predice los días siguientes (48 %). No se le da más peso.
- **No se añade** la matriz de escenarios del oro: contradice lo medido.
