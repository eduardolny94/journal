# Mesa de agentes · Global Traders FX

Equipo de analistas (no operan) que cada mañana leen macro, política monetaria, datos y bonos para los pares del swing
de César y dejan una ficha por par con sesgo, confianza, motivos e invalidación. Decidido el 20-10-2026; César opera,
los agentes leen. Vive dentro del repositorio del journal para compartir datos, scripts, base de datos y memoria.

## Principios (no negociables)

1. **El sesgo que manda es el medido** (nivel A/B de la capa de convicción del radar). Los agentes explican, vigilan y
   avisan de contradicciones; su sesgo se guarda y se mide, y solo entra en el modelo si pasa la regla de la casa
   (`.claude/skills/radar-metodologia`).
2. **Fuentes primarias antes que titulares**: comunicado del banco central, FedWatch/bono a 2 años, calendario con
   sorpresa en desviaciones, COT, pilares del radar. Noticias solo para detectar lo que cambia expectativas de tipos.
3. **Salida estructurada** (`formato/salida.schema.json`): sin número no hay nota. Cada ficha se contrasta con lo que
   pasó a 1, 5 y 20 días y se calibra (si dice 70 %, ¿acierta el 70 %?).
4. **Mejoran con el cuaderno de errores** (`cuaderno/`): revisión semanal de fallos → cambio concreto en la ficha de la
   divisa → versión nueva → se mide. Nunca reajustar a diario.
5. **Se miden hacia delante.** Con eventos pasados el modelo ya sabe el final; no vale como prueba.
6. **Coste contenido**: una pasada diaria y una lectura por evento grande; 2–5 $/mes de API.

## Estructura

- `biblioteca/` — qué leen antes de opinar: índice de guías (DCM FX, Protrader) y de lo medido en el journal.
- `fichas/` — lo primordial de cada divisa y de cada par del universo de swing.
- `metodo/` — guiones de lectura por tipo de evento (Fed/bancos centrales, IPC, empleo, PIB, discursos, geopolítica).
- `formato/` — contrato de salida (JSON) y ejemplo.
- `agentes/` — roles y prompts: analista macro, analista de flujos, jefe de mesa.
- `cuaderno/` — errores y cambios de versión de las fichas.
- `salidas/` — fichas diarias generadas (JSON por fecha); de aquí lee la pestaña "Mesa" del radar.

## Fases

1. **Biblioteca, fichas, método y formato** (sin API): esta carpeta. Hecho el 20-10-2026 en su primera versión.
2. **Motor** (`src/`): junta las fuentes del día (radar, calendario, bonos, comunicados, noticias), llama a los agentes con
   la API de Claude, valida el JSON, lo guarda en `salidas/` y en la base de datos, y lo muestra en el radar (pestaña
   "Mesa", solo dueño). Necesita la clave de Anthropic (prepago) en `.env` como `ANTHROPIC_API_KEY`.
3. **Medición**: tabla de acierto y calibración por agente y par, visible en la misma pestaña; cuaderno semanal.
4. **Si añade acierto**, su sesgo entra como candidata en la capa de convicción y se mide con la regla de la casa.

## Cómo se verá

Pestaña "Mesa" en el radar (solo dueño): una tarjeta por par con el número del radar, la lectura de cada analista
(sesgo, confianza, dos motivos, invalidación), la confirmación de bonos y el aviso del jefe de mesa cuando hay
discrepancia; arriba, el evento del día con su lectura a los 10 minutos; abajo, el marcador de acierto de cada agente.
