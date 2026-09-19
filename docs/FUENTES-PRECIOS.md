# Fuentes de precios: alternativas a Yahoo Finance

Investigación del 19-09-2026. Lo que funciona sin clave se probó con peticiones reales; lo que exige cuenta (OANDA,
Tiingo, Massive) sale de su documentación y de comprobar que el endpoint responde. **Todavía no está implementado**: el
radar sigue usando Yahoo.

## Qué le pasa a Yahoo (medido)

- La vela diaria de divisas se corta a las **00:00 de Londres**, no a las 17:00 de Nueva York (el cierre real del mercado
  y el que usa MT5). Un "ayer" distinto cambia máximos, mínimos y la vela del método.
- El volumen viene a cero y la apertura es casi idéntica al cierre anterior (no hay huecos reales).
- No es una API oficial: responde 429 sin `User-Agent` y puede cambiar sin aviso.

## Comparativa

| Fuente | Oficial | Cobertura | Gratis → de pago | Calidad | Pega |
|---|---|---|---|---|---|
| **OANDA v20 (cuenta practice)** | Sí | FX, oro, plata, índices CFD, petróleo. **Sin VIX ni DXY** | Gratis, 120 peticiones/s | Bid/ask/mid, velas D1 a las 17:00 NY, marca `complete`, todos los precios en una sola petición | La licencia solo permite **uso propio**: prohíbe mostrar sus precios a terceros |
| **Twelve Data** | Sí | FX y oro gratis; plata, WTI, DAX, FTSE en Grow. **Sin SPX, NDX, DJI, VIX, DXY** | Gratis no alcanza (800/día) → Grow 29 USD/mes | Solo precio medio, sin volumen, mete velas de fin de semana | Índices de EE. UU. fuera |
| **Tiingo FX** | Sí | Solo FX (140+ pares) | Gratis no alcanza → 30 USD/mes | Bid/ask de bancos de primer nivel | Solo divisas |
| **Massive (antes Polygon)** | Sí | FX y cripto; índices en otro plan | Gratis no alcanza → 49 USD/mes | Velas del mejor bid/ask, 10+ años | Caro para lo que cubre |
| **Capital.com API** | Sí (broker, demo) | FX, metales, índices, petróleo | Gratis, 10 peticiones/s | Bid y ask | Sesión que caduca a los 10 min |
| **Dukascopy (`freeserv`)** | **No** (endpoint del widget) | **Todo**, incluidos VIX y DXY | Gratis | Bid y ask, volumen, UTC, sin velas de sábado; probado con ráfagas | Tan poco oficial como Yahoo; exige cabecera `Referer` |
| EODHD | Sí | FX e índices | 20/día → 30 USD/mes | Coincide con Yahoo al céntimo: parece la misma fuente | No aporta nada |

Descartados: Stooq (ahora pone un reto anti-bot), TrueFX (vacío sin sesión), Alpha Vantage (25 peticiones/día), FCS API
(3/min; el plan útil cuesta 99 USD/mes), Databento (solo futuros CME, 199 USD/mes), TradingView (no tiene API de datos),
cTrader Open API y MetaApi (válidos pero complejos o de pago por cuenta).

## Recomendación

1. **Principal: OANDA v20 practice** mientras el radar sea de uso interno del equipo. Da la vela diaria correcta
   (17:00 NY, igual que MT5) y baja las peticiones de ~44.000 a ~9.800 al día.
2. **Respaldo: Yahoo** (lo que ya hay), que además sigue siendo la fuente de VIX y DXY. Dukascopy como tercera vía y
   para cruzar precios.
3. **Si la plataforma se vende a suscriptores**, la licencia de OANDA ya no vale: pasar a Twelve Data (plan business) o
   Tiingo comercial, y dejar Yahoo/Dukascopy solo para índices de EE. UU., VIX y DXY.

Antes de empezar: comprobar que OANDA abre cuenta demo desde tu país (el token lo crea y lo pega el usuario en `.env`).

## Arquitectura propuesta (`server/src/radar/sources/prices.js`)

- Interfaz común `getCandles(symbol, tf, count)` y `getQuotes(symbols[])`, con un adaptador por proveedor.
- Mapa de símbolos (`EURUSD → { oanda: 'EUR_USD', yahoo: 'EURUSD=X', duka: 'EUR/USD' }`); VIX y DXY solo Yahoo/Dukascopy.
- Caché en SQLite pidiendo solo velas nuevas; si el proveedor falla se sirve lo último guardado.
- Tras 3 fallos o un 429, conmutar al respaldo 10 minutos; cada respuesta lleva `source` para mostrar de dónde viene.
- No mezclar proveedores dentro de una misma serie (el corte de la vela diaria es distinto): al conmutar se cambia la serie entera.
- Normalizar a UTC y precio medio, descartar velas sin cerrar y de fin de semana; avisar si dos fuentes difieren más de un 0,3 %.
