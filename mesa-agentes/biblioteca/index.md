# Biblioteca de la mesa · qué leer antes de opinar

Rutas relativas a la raíz del repositorio. Los agentes reciben el contenido de los documentos marcados con ★ en cada
pasada; el resto se consulta por tipo de evento.

## Método (guías de DCM FX y Protrader)

- ★ `docs/LECTURA-FED.md` — actas y decisiones: primero lo descontado, luego el texto, luego la confirmación 2Y/10Y →
  DXY → oro/Nasdaq → petróleo. Checklist de 10 minutos y 7 preguntas.
- ★ `docs/LECTURA-IPC.md` — IPC: la sorpresa frente al consenso manda sobre el nivel; el primer latigazo no anticipa.
- `docs/GUIA-INTRODUCTORIA-DCMFX.md` — vocabulario, clases de activo, relaciones entre mercados y qué tiene el radar.
- `docs/aprendizaje-videos/protrader5-semana1.md` — la dirección viene de la macro; "el gordo sigue engordando".
- ★ `docs/aprendizaje-videos/protrader5-sesion2.md` — una noticia solo mueve si cambia las expectativas de tipos; solo
  empleo, inflación, tipos y PIB cambian tendencias; todo se descuenta el lunes; oro, dólar e índices en crisis.
- `docs/aprendizaje-videos/daniel-curto-fundamentales.md` — fase del ciclo por economía, matriz crecimiento × inflación.
- `docs/METODO-LECTURA-SEMANAL.md` — preparación de la semana (expectativas tipo FedWatch).

## Lo medido en el journal (lo que un analista de fuera no sabe)

- ★ `docs/BONOS-DIRECCION.md` — el bono acompaña al dólar (68 % diario, 76 % en el mismo tramo horario) pero no lo
  anticipa (49–57 %); movimientos ≥ 8 pb no continúan al día siguiente.
- ★ `docs/CPI-LONDRES.md` — el día del dato manda la sorpresa (1.ª vela 76–82 %); la 1.ª vela no se continúa (39 %).
- `docs/LECTURA-IPC.md` (parte medida) — oro sube el 69–86 % de los días de IPC sea cual sea el dato.
- `docs/IMPACTO-EVENTOS.md` — pips por desviación y acierto a 1 h por indicador (NFP 80 %, IPC 75 %, duraderos 33 %).
- `docs/CONVICCION.md`, `docs/VALIDACION-RADAR.md` — nivel A/B: 67 % a 5 días el último año, 53–55 % con menos
  historial; la fuerza sola no tiene ventaja; "tendencial" empeora.
- `docs/REGIMENES.md` — solo el modelo de salto separa (turbulento = no fiarse del radar).
- `docs/ESTRATEGIA-SWING-H4.md` — cómo opera César: cruce 8/18 en H4, barrido y recuperación, nivel verde-rojo-rojo; solo
  gana con el radar a favor.
- `docs/MANIPULACION-ASIA.md` — intradía: rotura de Asia a favor del radar en AUDCAD/AUDCHF/CADCHF.
- `docs/BITACORA-NOTICIAS.md` — cómo se han leído las últimas actas, decisiones y datos (y qué pasó después).

## Fuentes vivas (las lee el motor, no el agente)

- Radar: `GET /api/radar/snapshot` (fuerza, nivel, confirmación cruzada, intradía, swing, lectura del dato).
- Calendario con consenso y sorpresa: tabla `radar_calendar`; impacto calibrado: `server/src/radar/data/event-impact.json`.
- Bonos a 2 años por divisa: `radar_series` (FRED/BCE/BoE/MoF/BoC/RBA + TradingView en vivo).
- FedWatch propio: `fedwatch_log` en `radar_meta`. COT: `radar_cot`. Noticias: `radar_news`.
- Comunicados: página oficial de cada banco central (texto original); Econic lo resume pero se lee el original.
