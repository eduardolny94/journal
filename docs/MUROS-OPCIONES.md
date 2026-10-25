# Muros de opciones (CALLS/PUTS por strike) · indicador y límites de los datos (25-10-2026)

Lo que César vio en la captura de Daniel Curto (Econic) son **niveles de opciones**: strikes con más interés abierto en las
opciones sobre el futuro del oro (CME, producto GC). Rojo = CALLS por encima del precio (resistencias), verde = PUTS por
debajo (soportes), azul = el muro más cercano; las estrellas miden el tamaño del interés abierto. No es un indicador de
precio: sale del interés abierto de cierre de cada día, así que **se actualiza una vez al día**, no en tiempo real.

## Indicador: `client/public/descargas/GTFX_MurosOpciones.pine` (Pine v6)

- Dos campos de texto: CALLS y PUTS con formato `precio:estrellas, precio:estrellas` (estrellas 1–5). Dibuja un muro por
  nivel, marca en azul el más cercano por arriba y por abajo, y lleva dos alertas ("precio en muro de CALLS/PUTS").
- Instalación: TradingView → Editor Pine → pegar el archivo → "Añadir al gráfico" (igual que GTFX · Velas de Asia).
- Actualización diaria (manual, 2 minutos): abrir en el navegador la página pública del CME "Gold Option Volume & Open
  Interest" (cmegroup.com → Markets → Metals → Gold → Volume → Options), elegir el vencimiento más cercano, ordenar por
  "At Close" (interés abierto) en Calls y en Puts, copiar los 3–5 strikes más grandes de cada lado y pegarlos en el
  indicador. Para divisas: las opciones de los futuros 6E (euro), 6B (libra), 6J (yen), 6A (AUD), 6C (CAD), 6S (CHF).

## Por qué no se automatiza con la web del CME

El 25-10-2026 se probó descargar los datos desde el servidor: el CME devuelve 403 y un aviso explícito de que el uso de
scripts o scrapers está prohibido por sus condiciones de uso de datos; además bloqueó temporalmente la IP de la casa de
César para esos endpoints. **No se construye un robot contra esa web.** Vías legítimas para automatizarlo:

1. Un bróker con API que licencie los datos de opciones del CME para uso personal (Interactive Brokers con la suscripción
   de datos de CME: el API da interés abierto por strike). Es la vía normal para un particular.
2. Un proveedor con licencia (Barchart OnDemand, CME DataMine): de pago.
3. Manual: la página pública, a mano, una vez al día. Es lo que hace el indicador ahora.

## ¿Son "bias diarios"?

No. Un muro de opciones es un nivel donde hay mucho interés abierto; la teoría (cobertura de los creadores de mercado)
dice que el precio tiende a frenarse ahí cerca del vencimiento, no que vaya a subir o bajar. Es un **mapa de niveles
diario**, útil para poner objetivos y stops, no una dirección. La dirección la siguen dando el radar y la mesa.

## Qué falta medir (regla de la casa)

No hay histórico gratuito de interés abierto por strike, así que no se puede backtestear. Plan: anotar cada día en el
journal los muros que se usen (fecha, strike, estrellas) y, con 2–3 meses, medir si el precio reacciona en ellos más que
en niveles al azar. Hasta entonces, las estrellas son una opinión, no una probabilidad.
