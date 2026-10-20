# Protrader 5 · Sesión 2 con los mentores (27-05-2026) — síntesis y lo medido (20-10-2026)

Fuente: "Transcripción para IA" oficial (34 páginas, 19.948 palabras). Clase de preguntas con los mentores (Saúl y Miki),
sin estrategia nueva: criterio para leer noticias, contexto por divisa, gestión y plataformas.

## Lo que enseñan (ideas con sustancia)

1. **Una noticia solo mueve la divisa si cambia las expectativas de tipos.** "Lo primero: ¿este dato cambia lo que va a
   hacer el banco central? Si no, es un movimiento liquidativo que no rompe zonas clave." Su sección favorita de Econic:
   diferencial de tipos y tipos reales. Ventas minoristas o confianza del consumidor suelen ir a "liquidar máximos o
   mínimos", a favor o en contra del dato; mandan los tipos.
2. **Solo cuatro datos cambian tendencias: empleo, inflación, tipos y PIB**, más lo último que dijo el banco central.
   El resto se mira para contexto, no para operar. Contexto mínimo: 3–4 semanas (ahí caen los cuatro). Si una divisa no
   tiene datos esa semana, lateraliza hasta los siguientes: mejor no operarla.
3. **Todo se descuenta al abrir el lunes.** No esperar al día del dato para entrar; el 95 % de las veces es mejor entrar
   antes (apertura de Londres del lunes). Un dato del viernes se descuenta desde el lunes; una decisión de tipos muy
   esperada ya está descontada semanas antes.
4. **Cuando todos los bancos centrales van en la misma dirección, compara quién sube más y antes.** Ejemplo EURNZD:
   sin diferencia de expectativas → lateral; además el euro es más vulnerable al petróleo. Los máximos y mínimos
   semanales "necesitan noticias muy fuertes para romperse".
5. **Gaps:** si el gap lo causa un catalizador de peso (elecciones en Japón, un cambio fiscal), no esperes que se rellene.
6. **Oro:** refugio ante la incertidumbre, no ante caídas de bolsa; cuando el S&P cae fuerte, el oro suele caer con él
   (COVID, 2008, aranceles, 2022). **Dólar:** se aprecia en crisis porque el 90 % del comercio y la deuda emergente se
   liquidan en dólares, no por ser "refugio". **Índices:** estructuralmente alcistas (rotación de componentes, inflación
   nominal): priorizar compras. Para el Dow miran el petróleo; para el Nasdaq, semiconductores e IA (mapa de calor por
   sectores para saber quién tira).
7. **Gestión:** 1–1,5 % por operación en H4 (2–2,5 % como máximo con todo a favor y stop más amplio); repartir las
   operaciones de la semana entre 2–3 cuentas para que el drawdown diario no te saque; capital propio ≠ fondeo (el
   fondeo tiene normas diseñadas para que falles; en capital propio lo primero es sobrevivir: riesgo de ruina). Hay
   semanas sin operación; no hay "criterio para no operar", hay análisis.
8. Preparación: análisis de la semana el domingo, seguimiento diario. Fuentes: Econic, Trading Economics, Financial
   Juice, Investing, OTC. Estrategia H4 completa en la semana 3; ciclo económico en la 4; activos y futuros en la 5.

## Qué tenía ya el radar

- Punto 1: pilar de expectativas (bono a 2 años por divisa), `descontado` (Taylor − bono), FedWatch, `real` (tipo
  real) y, desde ayer, `diferencial_2a` y la confirmación cruzada. Punto 2: `sorpresa_grande` (solo tipos/IPC/PIB/
  empleo) y la calibración de impacto (bienes duraderos y Michigan no predicen: 33 %). Punto 3: el sesgo del radar se
  mide con el dato del día anterior y la señal de "qué operar" sale cada día, no el día del dato. Punto 6 (dólar):
  `riskBeta` USD −0,5 (sube con el miedo). Punto 7: limitador y bloqueo estricto por cuenta.

## Lo medido hoy

**A) "Sorpresa confirmada por el bono"** (punto 1 convertido en condición): la última sorpresa de 48 h cuenta solo si
el bono a 2 años de esa divisa se movió ≥ 2 pb en el mismo sentido ese día. Candidata `sorpresa_confirmada`
(FEATURE_VERSION 8). Ablación, nivel A fuera de muestra a 5 días: 70,2 % frente a 69,8 % (corte 2/3), 54,1 % frente a
54,9 % (1/2), 50,1 % frente a 50,1 % (1/3). **No pasa**: igual que `sorpresa_grande`, el filtro de "solo lo que mueve
los tipos" no mejora el modelo a 5 días. A 1 día mejora en dos cortes (+4,5 y +3 puntos) y empeora en uno (−4). Queda
vigilada por el ciclo semanal.

**B) Oro frente al S&P** (punto 6), velas diarias MT5 2024–2026 (617 días):

| Día | Oro sube | Oro medio |
|---|---|---|
| Todos | 55 % | +0,09 % |
| S&P cae ≥ 1 % (n = 56) | 39 % | −0,45 % |
| S&P cae ≥ 1,5 % (n = 32) | 34 % | −0,50 % |
| S&P sube ≥ 1 % (n = 68) | 56 % | +0,42 % |
| Día siguiente a una caída ≥ 1,5 % | 50 % | +0,10 % |

Los mentores tienen razón: el oro cae con la bolsa los días de caída fuerte (correlación diaria +0,19). Implicación
para el radar: el pilar `riesgo` del oro en `instruments.js` suma con el VIX alto ("miedo: refugio"). En el corto plazo
eso va al revés de lo medido; pendiente de medir con histórico del VIX antes de cambiar el signo (regla de la casa).

**C) Punto 2 ya estaba medido**: `sorpresa_grande` no pasa los tres cortes (ayer y hoy); el impacto a 1 h sí es mayor en
NFP/IPC (26–27 pips/σ) que en datos secundarios.

## Qué queda

- Candidatas `sorpresa_confirmada`, `diferencial_2a` y `confirmacion_cruzada` vigiladas por el ciclo (Admin →
  Diagnóstico). Ninguna cambia hoy el modelo activo.
- Revisar el signo del pilar riesgo del oro cuando haya histórico del VIX en la base de datos.
- Sesión 3 (estrategia H4 completa: entradas, stops, gestión) es la que de verdad se puede contrastar con el swing.
