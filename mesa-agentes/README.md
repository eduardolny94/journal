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
- `salidas/` — fichas diarias generadas (una carpeta por fecha con `paquete.json` y un JSON por agente). La pestaña
  "Mesa" del radar lee de la base de datos (`mesa_pasadas`, `mesa_fichas`); los archivos son la copia legible.
- Motor: `server/src/mesa/` (vive en el servidor porque necesita la base de datos, el snapshot del radar y la
  sesión del dueño): `paquete.js` arma el paquete del día, `agentes.js` llama a la API, `esquema.js` valida el
  contrato, `index.js` guarda y programa. Rutas en `server/src/routes/mesa.js` (`/api/mesa`, solo dueño).

## Fases

1. **Biblioteca, fichas, método y formato** (sin API): esta carpeta. Hecho el 20-10-2026 en su primera versión.
2. **Motor** (`server/src/mesa/`): junta las fuentes del día (radar, calendario, bonos, FedWatch, COT, tono, noticias),
   llama a los agentes con la API de Claude (macro → flujos → jefe, en serie para compartir la caché de prompts),
   valida el JSON, lo guarda en `salidas/` y en la base de datos, y lo muestra en el radar (pestaña "Mesa", solo
   dueño). Hecho el 20-10-2026. Necesita la clave de Anthropic (prepago) en `.env` como `ANTHROPIC_API_KEY`.
3. **Medición**: tabla de acierto y calibración por agente y par, visible en la misma pestaña; cuaderno semanal.
4. **Si añade acierto**, su sesgo entra como candidata en la capa de convicción y se mide con la regla de la casa.

## Cómo se usa (fase 2)

- `.env` (raíz): `ANTHROPIC_API_KEY=…`. Opcionales: `MESA_MODEL` (por defecto `claude-opus-5-5`), `MESA_EFFORT`
  (`high`), `MESA_HORA` (`07:00`), `MESA_TZ` (`Europe/Madrid`), `MESA_AUTO=0` apaga la pasada automática.
- Con el servidor arrancado, la mesa pasa sola a `MESA_HORA` los días laborables (una vez al día). En el radar,
  pestaña Mesa, el botón «Pasar la mesa ahora» la lanza a mano (una cada 10 minutos como máximo).
- Terminal: `npm run mesa -w server` pasa la mesa; `-- --paquete` imprime el paquete sin llamar a la API;
  `-- --fichas [fecha]` muestra las fichas guardadas. `npm run test:mesa -w server` prueba el motor sin API.
- Coste medido el 20-10-2026: el paquete variable son ~17.000 tokens y los documentos fijos ~8.000 (en caché). Con
  Opus 5.5 una pasada ronda 0,4–0,9 $ (tres llamadas con razonamiento), es decir 8–18 $/mes en días laborables; con
  `MESA_MODEL=claude-sonnet-5-5` aproximadamente la mitad y con `claude-haiku-5-5` céntimos. El coste real de cada
  pasada queda en la tabla `mesa_pasadas` y en el historial de la pestaña.
- Qué recibe cada agente: `roles.md` como papel, las reglas de la casa, `fichas/divisas.md`, `metodo/lectura-eventos.md`
  y los cinco documentos ★ de la biblioteca (bloque fijo, en caché), más el paquete del día (radar por par del
  universo, 8 divisas con pilares, expectativas, tono y COT, bonos a 2 años a 1/5/20 días, registro de FedWatch,
  calendario de impacto alto ±1 semana, noticias de 24 h de sus divisas, swing e intradía, lectura del dato).

## Cómo se ve

Pestaña "Mesa" en el radar (solo dueño): una tarjeta por par con el número del radar, la lectura de cada analista
(sesgo, confianza, dos motivos, invalidación), la confirmación de bonos y el aviso del jefe de mesa cuando hay
discrepancia; arriba, el evento del día con su lectura a los 10 minutos; abajo, el marcador de acierto de cada agente.
