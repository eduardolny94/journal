# Cómo se lee la semana (el método detrás de la pestaña "Semana" del Radar)

Este documento describe la lectura que el Radar reproduce cada domingo, extraída del reporte fundamental de referencia (13 de septiembre de 2026) y del método del propio trader. Sirve para entender por qué el radar dice lo que dice.

## 1. Primero, lo que ya está descontado

Antes de mirar gráficos, se mira qué probabilidad da el mercado a la próxima decisión de cada banco central (FedWatch para la Fed; herramientas equivalentes para BCE, BoE y BoJ). Regla de lectura:

- **≥ 85 % para una opción** (ejemplo del reporte: 87,3 % de subida): la decisión está "prácticamente descontada". El movimiento grande viene si NO ocurre. En el radar: `priced = subida`, cautela "la sorpresa sería que no ocurra".
- **70-85 %**: descontada pero con margen: la rueda de prensa y las proyecciones deciden la dirección.
- **< 70 %**: sin consenso; la decisión moverá el mercado en ambas direcciones; no se toma posición antes.

Todo el ruido de la semana (titulares geopolíticos, ataques, declaraciones) se lee con perspectiva: si la decisión está descontada, el ruido suele ser eso, ruido.

## 2. El calendario, día por día

Se recorre la semana buscando solo eventos de alto impacto de las divisas que se operan:

- **Días tranquilos** (sin eventos de alto impacto): en el ejemplo, lunes y martes. Se anotan como días de espera o de operar solo con estructura.
- **Evento pivote**: la decisión de tasas más importante de la semana (Fed > BCE > BoE > BoJ). "La semana empieza a partir de los tipos": todo lo anterior es preparación.
- **Eventos secundarios**: IPC (Reino Unido, Eurozona), decisiones de otros bancos el mismo día o el siguiente (BoE, BoJ).

El radar marca el riesgo por día (alto / medio / bajo) y señala el pivote con su motivo.

## 3. Cautelas

- **Niveles de tasa inusuales**: "Japón en 1,25 % frente a 1,0 %, llevaba tiempo sin pasar" → cuidado con el yen y con todo lo que lo cruce. El radar avisa cuando una tasa de política está en máximo de 10 años.
- **Decisiones de varios bancos la misma semana**: volatilidad cruzada; los cruces (EURGBP, GBPJPY) se vuelven impredecibles.
- **Posicionamiento extremo (COT)**: si los fondos están cargados de un lado, la sorpresa produce movimientos violentos.
- **VIX alto**: modo refugio; el sesgo por tasas pesa menos que el miedo.

## 4. La postura

De lo anterior sale una postura clara y escrita:

- Con pivote de tasas: **sin sesgo direccional hasta después de la decisión**; esperar velas grandes y volatilidad en la apertura y en la sesión de Nueva York; posible gap en la apertura semanal.
- Sin pivote: semana de datos; se opera el sesgo del radar (divisa fuerte contra débil) respetando los avisos de noticias (nada nuevo 2 h antes de un dato de alto impacto).

## 5. Cómo se combina con el método del trader (semanal, diario y 4 horas)

1. El radar da la **dirección** (par y sesgo) y las **razones** (tasas, inflación, sorpresas, COT, riesgo, momentum).
2. El trader mira la **vela de ayer**: si cerró con fuerza (rango ≥ 80 % del ADR, cierre en el extremo), al día siguiente espera un **retroceso al 50 %** de esa vela para continuar en la dirección del sesgo. El radar calcula ese 50 % (`pd_mid`), la posición del precio dentro del rango de ayer (descuento / premium) y el recorrido restante estimado según el ADR.
3. Los **puntos de reacción** salen del semanal y el diario (máximo/mínimo y 50 % de la semana pasada y de ayer) y se confirman en 4 horas (estructura HH/HL o LH/LL). Si la estructura de 4 h contradice al sesgo macro, se espera confirmación.
4. Todo queda escrito en "Mi reporte del domingo" dentro del radar, y cada operación registrada en el journal guarda si fue a favor o en contra del sesgo, para medir con el tiempo si el método suma.

## 6. Lo que el radar no hace

- No predice el dato ni la primera vela: los backtests con velas reales (docs/BACKTEST-NOTICIAS.md) muestran que la dirección previa a un dato no anticipa nada y que perseguir la primera vela de CPI o nóminas pierde dinero. Solo la reacción a la Fed tiene seguimiento operable.
- No dice "compra" ni "vende": dice sesgo, estimación y zona. La entrada es del trader.
