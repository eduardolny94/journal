# Curso «Fundamentales aplicados al trading» · Daniel Curto (DCM FX) · visto el 09-10-2026

Cinco episodios (3 horas) vistos con Gemini vídeo a vídeo (skill watch). Abajo, la síntesis del método, la comparación
con lo que el radar ya hace y las reglas candidatas a medir. Al final, el detalle por episodio con marcas de tiempo.
Regla de la casa: nada de esto cambia pesos ni condiciones del radar sin medirse antes (`radar-metodologia`).

## 1. El método en una página

1. **Cuatro motores**: crecimiento (PIB, PMIs como adelantado, ventas minoristas, producción industrial, confianza),
   empleo (NFP, paro, salarios por hora, peticiones semanales, participación), inflación (IPC general y subyacente, IPP,
   PCE, expectativas) y política monetaria (decisiones, actas, discursos, futuros de tipos y swaps). No hay «ABC»: el
   mismo dato significa cosas distintas según la fase del ciclo.
2. **Efecto dominó**: crecimiento fuerte → empleo tenso → salarios y consumo → inflación → el banco central sube tipos →
   frena consumo e inversión → vuelve a empezar. En divisas: inflación alta → tipos altos más tiempo → divisa fuerte
   (carry) → bolsa y oro presionados; y al revés.
3. **Matriz de cuatro escenarios** (crecimiento × inflación) con la reacción típica de bolsa, bonos, dólar y oro:
   fuerte/moderada (bolsa +, bonos −, USD +); débil/baja (bolsa −, bonos +, oro +); estanflación (bolsa −−, bonos −,
   oro ++); fuerte/alta (bolsa mixta, bonos −−, USD +, oro mixto).
4. **Cuatro fases del ciclo** y cómo se diagnostican: expansión (PIB ↑, paro ↓, crédito ↑), pico (inflación > 2 %, PMIs
   bajando aunque > 50, curva plana o invertida, bolsa en máximos con más volatilidad, política restrictiva), recesión
   (dos trimestres negativos, paro ↑, refugios CHF/JPY/oro/bonos, recortes), recuperación (PMIs vuelven hacia 50, la
   bolsa rebota meses antes de que lo confirmen los datos, el oro pierde atractivo).
5. **Del contexto al par**: siempre en relativo (una economía contra otra). Primero la tesis macro, luego el gráfico
   solo para situar entrada y stop: lo técnico es el 10-15 % del trabajo. Posicionarse con meses de antelación
   («en junio o julio para octubre o noviembre»), no en la vela del dato.
6. **Noticias en tres fases**: antes (consenso frente a anterior, fase del ciclo, los tres escenarios planificados, «no
   casarse con nadie»); durante (no entrar en los primeros minutos: HFT, spreads y barridos de stops; confirmar con
   volumen y estructura; vigilar revisiones del dato anterior; coherencia entre activos, p. ej. si el oro no acompaña
   esperar); después (continuidad o reversión, forward guidance). Lo que mueve no es el dato, es la **sorpresa frente al
   consenso**. Solo cuatro datos cambian tendencias: tipos, IPC, PIB y empleo; el resto es ruido aunque tenga tres estrellas.
7. **Geopolítica por encima de todo**: jerarquía técnico < acción del precio < macro < geopolítica. «Si veo misiles
   volar, lo que menos me importa es el IPC». USD y oro como refugio, USDJPY como canal del carry, petróleo y Ormuz,
   gas y el euro, semiconductores y el Nasdaq. Distinguir shock sorpresa de lo ya descontado.

Lo que el curso **no da**: reglas de tamaño, riesgo por operación, stop, ni gatillos de entrada (remite a su formación
de pago). Resultados: solo afirmaciones (70 % de acierto en un panel, un retiro de 7.000 $), sin historial verificable.

## 2. Qué tiene ya el radar y qué no

| Idea de Curto | Radar hoy | Estado |
|---|---|---|
| Cuatro motores por divisa | Pilares tasas, expectativas (bono 2 años), inflación, crecimiento (PMI/PIB), posicionamiento, riesgo, momentum, tono | ✔ (sin pilar de empleo propio: el paro entra en la regla de Taylor, peso 0) |
| Sorpresa frente al consenso, no el dato absoluto | `surpriseOf`, z por indicador, β calibrada (`event-impact.json`), índice de sorpresas (CESI, peso 0) | ✔ medido |
| No operar la vela del dato | Backtests: la primera hora no continúa (48 %); aviso «nada nuevo 2 h antes de un dato fuerte» | ✔ medido |
| Lo descontado antes del evento | FedWatch propio, expectativas con regla ≥ 85 %, pivote de la semana | ✔ |
| Antes / durante / después | ImpactCard (escenarios ±1σ con pips y acierto), tono manual versionado, bitácora de noticias | ✔ parcial: falta la fase «después» automática (confirmación cruzada) |
| Matriz crecimiento × inflación | No existe como tal; el oro y los índices tienen pilares tipos reales / dólar / riesgo / Fed | ✘ candidato |
| Fase del ciclo por economía | Solo régimen por VIX (calma / tensión) | ✘ candidato |
| Curva de tipos (plana o invertida = pico) | Bono 2 años nominal, 10 años real y breakeven; falta el 10 años nominal y la pendiente 10-2 | ✘ candidato |
| Geopolítica manda | Titulares RSS con palabras clave, sin señal de «shock geopolítico» | ✘ candidato |
| Técnico como 10-15 % (entrada y stop) | Método del usuario: sesgo + vela de ayer + retroceso al 50 %; swing H4 medido | ✔ coherente |
| Posicionarse con meses de antelación | El radar mide a 1, 5 y 20 días; el sesgo macro solo acierta ~50 % a 1-10 días | ⚠ conflicto: hay que medir a 20-60 días |

## 3. Reglas candidatas a medir (orden propuesto)

1. **Fase del ciclo por economía** (point-in-time): PMI compuesto nivel y pendiente a 3 meses, paro pendiente a 6 meses,
   inflación frente al objetivo, pendiente de la curva. Clasificar expansión / pico / recesión / recuperación y medir si
   «divisa en expansión contra divisa en recesión» acierta más a 5 y 20 días que el sesgo actual. Entra como pilar con
   peso 0 y condición candidata del modelo de convicción (`FEATURE_NAMES`, `FEATURE_VERSION` +1).
2. **Escenario crecimiento × inflación para USD** aplicado a oro, Nasdaq y S&P (instrumentos): medir en 5 años si la
   celda de la matriz predice el signo a 20 días.
3. **Pendiente 10-2 años de EE. UU.** (FRED DGS10 − DGS2) como condición de «pico»: añadir DGS10 a las series y medir.
4. **Solo cuatro datos cambian tendencias**: variante de la condición `ultima_sorpresa` restringida a tipos, IPC, PIB y
   empleo; comparar acierto con la versión actual (todas las categorías).
5. **Alerta geopolítica** desde titulares (palabras clave de conflicto, Ormuz, aranceles, semiconductores) que baje la
   confianza del sesgo o suba el riesgo: medir si los días con alerta tienen menor acierto del sesgo (si no, no entra).
6. **Horizonte largo**: repetir el backtest del sesgo a 20 y 60 días con las condiciones de ciclo; si el sesgo macro
   funciona mejor a meses que a días, la tarjeta debe decirlo (y el usuario operar swing con ese horizonte).

Lo que ya está medido y no se repite: perseguir la primera vela (pierde), ponderar más la fuerza 4-5 (no ayuda),
fundamentales lentos (Taylor, PPP) a 5 días (no mejoran el nivel A).

## 4. Detalle por episodio (resúmenes de Gemini, con minutos)

## 1 · Iniciación a la macroeconomía. Episodio 1/5
https://www.youtube.com/watch?v=1XFU5a1zRms · 21 min

Este vídeo corresponde al **Episodio 1 («Iniciación a la macroeconomía y lo fundamental que es»)** de una miniserie de 5 entregas. Al ser un capítulo introductorio y conceptual, expone el marco analítico macroeconómico y la lógica causal que utiliza, pero **no** incluye aún reglas cuantitativas de ejecución técnica, gestión de riesgo o dimensionamiento, las cuales anuncia para capítulos posteriores.

A continuación se detalla exhaustivamente todo lo correspondiente al método, afirmaciones y distinciones presentadas en la sesión:

---

#### 1) Variables macroeconómicas, orden y combinación
* **Las cuatro patas o pilares de la economía** [15:58 - 17:45]:
  Daniel Curto sostiene que toda la economía y los mercados se sostienen sobre cuatro motores interconectados:
  1. **Crecimiento (PIB):** Medido por el Producto Interior Bruto (desglosado en consumo, inversión, gasto público y exportaciones netas [06:40 - 06:55, 11:30 - 11:45]). Determina la fortaleza económica general y el apetito hacia activos de riesgo / renta variable [16:40 - 16:50].
  2. **Inflación:** Aumento de precios que actúa como termómetro de la estabilidad y determina la política monetaria [16:50 - 17:08].
  3. **Empleo:** La tasa de desempleo refleja la salud del mercado laboral e impacta directamente en el consumo y en el crecimiento [17:10 - 17:28].
  4. **Política monetaria:** Decisiones de los bancos centrales (tipos de interés, liquidez, impresión de dinero, QE y QT) que regulan la economía e impactan a todos los activos [08:35 - 09:00, 17:30 - 17:45].
* **No existe un orden rígido o sistema «ABC»** [15:33 - 15:45]:
  Afirma explícitamente: *«lo que no se puede hacer es tener un ABC en economía. No existe un ABC en economía, no existe un 1 2 3. Hay contextos y maneras de interpretarlo y diferentes situaciones»*.
* **Flujo intermercado del dinero** [18:55 - 19:20]:
  Para anticipar el mercado enseña a seguir cómo fluye el capital: de la **renta fija (bonos)** hacia **Forex (divisas)**, la búsqueda de **valores refugio** y su trasvase posterior a la **renta variable (S&P 500, Nasdaq)**.

---

#### 2) Formación de tesis y momento de entrada (rol del precio/gráfico)
* **Construcción de la tesis macro previa** [04:45 - 05:30, 10:10 - 10:50]:
  La tesis no se basa en adivinar el futuro, sino en interpretar el contexto previo y los ciclos económicos (fases de contracción o sobrecalentamiento). Los mercados y las noticias descuentan expectativas futuras, no el presente [18:35 - 18:50].
* **Papel del análisis técnico / gráfico** [00:35 - 00:50, 03:30 - 03:50, 07:55 - 08:05, 18:20 - 18:35]:
  * Otorga al análisis técnico tradicional (*order blocks*, FVG, roturas de soporte/resistencia o líneas de tendencia) un peso marginal: **representa únicamente el 10% al 15% (máximo 20%) del total del trading**.
  * El gráfico se utiliza solo como confirmación secundaria posterior al contexto macroeconómico: primero se formula la tesis fundamental (ej. impacto de tipos de interés) y posteriormente se acude al gráfico para proyectar el punto de entrada y el *Stop Loss* [18:10 - 18:35].
* *(Nota: En este vídeo introductorio no detalla indicadores técnicos concretos ni disparadores exactos de entrada al tick; indica que se explicarán en el episodio 3 [17:50 - 18:30]).*

---

#### 3) Reglas de tamaño, concentración y gestión del riesgo
* **No se mencionan en este vídeo.** Daniel Curto no facilita fórmulas de porcentaje de riesgo por operación, apalancamiento, tamaño de lote ni límites de concentración de cartera en esta sesión.

---

#### 4) Afirmaciones concretas sobre divisas, tipos, oro, petróleo y bancos centrales (relaciones causales)
* **Divisas y salud económica** [03:50 - 04:20]:
  El tipo de cambio refleja la salud de una economía. Si la economía empeora, su divisa se devalúa; si la economía se fortalece o está en auge, la divisa se aprecia.
* **Cadena causal: Inflación -> Tipos -> Dólar -> Renta variable / Oro** [12:40 - 15:25]:
  Presenta un ejemplo paso a paso del «efecto dominó»:
  1. *IPC subyacente elevado (mayor a lo esperado)*: Señala recalentamiento e inflación persistente [12:50 - 13:20].
  2. *Respuesta de la Fed*: Mantiene una política monetaria restrictiva (tipos de interés altos sin recortar) para frenar la expansión económica [13:30 - 14:05].
  3. *Impacto en el Dólar*: Se fortalece frente a otras divisas porque atrae inversión extranjera en busca de mayor rendimiento [14:10 - 14:25].
  4. *Mecanismo de Carry Trade*: Se pide prestado/vende la divisa de tipos bajos para reinvertir en la divisa de tipos altos que genera mayor rendimiento [14:30 - 14:48].
  5. *Impacto en Renta Variable (Nasdaq, S&P 500)*: Caen al encarecerse el coste del capital y reducirse la liquidez [14:50 - 15:00].
  6. *Impacto en el Oro*: Pierde atractivo frente al dólar/activos con rendimiento, al ser un activo sin rendimiento (*yield*) propio [14:58 - 15:15].
* **Bancos centrales como reguladores de liquidez** [08:35 - 09:00]:
  Funcionan como un «grifo» que regula el crédito, la oferta monetaria y el empleo.
* **Divergencia Trump vs. Jerome Powell** [11:00 - 12:15]:
  Trump persigue una política fiscal/monetaria expansiva (bajada de tipos para inflar el PIB mediante consumo, gasto e inversión, aun a costa de mayor inflación), mientras que Powell (Fed) busca tipos restrictivos para controlar la inflación.
* **Petróleo**: Solo se menciona tangencialmente al aclarar que el IPC subyacente excluye energía y alimentos por su volatilidad [12:55 - 13:05].

---

#### 5) Errores que reconoce y lecciones
* **No confiesa errores personales de trading pasados en este vídeo.**
* **Crítica a los errores habituales del operador minorista / novato**:
  * Operar trazando líneas subjetivas o figuras técnicas desde casa sin entender el trasfondo de política monetaria [02:20 - 02:40, 10:30 - 10:45].
  * Creer que los movimientos institucionales se deben al concepto de «Smart Money»: afirma que aprendió de un ex-empleado de banca central y de Citibank y asegura textualmente que *«el smart money no existe»* en la forma en que lo enseña el trading minorista [05:35 - 05:50, 08:20 - 08:30].
  * Esperar una señal de vela cuando las manos institucionales ya se han posicionado con meses de antelación al interpretar los datos del ciclo económico [09:05 - 09:25].

---

#### 6) Frases memorables literales (en inglés)
* **No hay frases memorables en inglés pronunciadas en el vídeo.**
  Toda la ponencia se imparte íntegramente en español. Las únicas palabras aisladas en inglés son tecnicismos habituales de la industria:
  * *«smart money»* [01:04, 05:43]
  * *«order block»* y *«FVG»* (*fair value gap*) [03:41 - 03:43]
  * *«carry trade»* [14:38]
  * *«QT»* (*quantitative tightening*) y *«QE»* (*quantitative easing*) [17:40]

## 2 · Iniciación a la macroeconomía. Episodio 2/5
https://www.youtube.com/watch?v=0njmKPqT9SI · 39 min

A continuación se detalla de forma exhaustiva y estructurada el método macroeconómico expuesto por Daniel Curto en este segundo episodio (*«Los cuatro motores de la economía»*), indicando minuciosamente lo que se muestra en las diapositivas y lo que dice verbalmente, así como los aspectos que el vídeo expresamente **no** incluye.

---

#### 1) Variables macro que analiza, orden y forma de combinarlas

Daniel Curto estructura todo su marco analítico en torno a lo que denomina los **«Cuatro Motores de la Economía»**:

#### A. Orden causal y conceptual del análisis:
1. **Crecimiento económico [05:15 - 12:35]:**
   * *Oído / Visto:* Es el termómetro de expansión o contracción económica [05:40]. Determina si un país genera más bienes y servicios.
   * *Ciclos económicos [09:30 - 12:30]:* Explica las 4 fases: *Expansión* (sube producción, empleo e inversión) [10:14], *Pico* (sobrecalentamiento, escasez laboral y presiones inflacionistas) [10:58], *Contracción* (freno, aumento del desempleo; dos trimestres consecutivos negativos = recesión técnica) [11:10 - 11:50] y *Recuperación* (suelo, reactivación del empleo y demanda) [12:00].
2. **Empleo [12:35 - 18:45]:**
   * *Oído / Visto:* Refleja la salud real y confianza económica [12:50]. Si hay empleo, suben los salarios; esto incrementa la renta disponible y el consumo, retroalimentando la demanda y la producción [13:20 - 14:20]. Si el mercado laboral está demasiado tenso (pleno empleo entre 3% y 5% de desempleo [17:05]), genera presiones salariales que fuerzan a subir tipos [15:10].
3. **Inflación [18:45 - 24:30]:**
   * *Oído / Visto:* Mide el incremento sostenido de precios. Objetivos de bancos centrales: ~2% anual (rango 1,8% - 2,2%) [20:43 - 21:05]. Explica sus causas: demanda [22:11], costes (energía, materias primas, salarios) [22:18], monetaria (emisión desmedida de masa monetaria / «imprimir billetes») [22:25] e importada (divisa débil o aranceles) [22:38].
4. **Tipos de interés [24:30 - 28:55]:**
   * *Oído / Visto:* Representan «el grifo» de la liquidez y «el precio del dinero» fijado por los bancos centrales (Fed, BCE) [24:45 - 25:10]. Condicionan el coste de pedir prestado y remuneración del ahorro. Afectan a la totalidad de los activos financieros [27:25].

#### B. La interacción cíclica (efecto dominó) [29:30 - 31:15]:
* *Crecimiento fuerte* $\rightarrow$ impulsa el *Empleo* $\rightarrow$ el mercado laboral tenso sube salarios y consumo $\rightarrow$ se desata la *Inflación* $\rightarrow$ los bancos centrales intervienen subiendo los *Tipos de interés* para enfriar la economía $\rightarrow$ los tipos altos frenan el consumo y la inversión, reduciendo de nuevo el crecimiento y reiniciando el ciclo.

#### C. Matriz de combinación en 4 escenarios de mercado [31:25 - 33:20]:
En pantalla muestra una tabla comparativa con la reacción teórica de los activos:
* **Escenario 1: Crecimiento fuerte + Inflación moderada [31:35]:**
  * *Acciones:* Positivo (sobre todo sectores cíclicos).
  * *Bonos:* Negativo (expectativa de subidas de tipos).
  * *Dólar:* Tiende a fortalecerse.
  * *Oro:* Mixto (cobertura residual).
* **Escenario 2: Crecimiento débil + Inflación baja [32:00]:**
  * *Acciones:* Negativo.
  * *Bonos:* Positivo (flujo hacia renta fija).
  * *Dólar:* Comportamiento relativo (depende de la divisa contra la que cotice).
  * *Oro:* Positivo (activo refugio).
* **Escenario 3: Estanflación (Bajo crecimiento + Alta inflación) [32:20]:**
  * *Acciones:* Muy negativo.
  * *Bonos:* Negativo.
  * *Dólar:* Depende de la respuesta de la política monetaria.
  * *Oro:* Muy positivo (máxima protección contra la inflación).
* **Escenario 4: Crecimiento fuerte + Alta inflación [32:42]:**
  * *Acciones:* Mixto (bueno por beneficios empresariales, pero lastrado por tipos altos).
  * *Bonos:* «Horriblemente malo» (fuga de capitales de la renta fija).
  * *Dólar:* Fuerte (el capital rota de bonos a acciones canalizándose a través de la divisa) [32:55].
  * *Oro:* Mixto (positivo por inflación, pero castigado por tipos de interés elevados).

#### D. Indicadores concretos que monitoriza [33:30 - 35:25]:
* **Crecimiento:** PIB trimestral [33:38], PMIs manufacturero y de servicios (destacados como *indicadores adelantados* clave del PIB) [33:45], Ventas minoristas [33:50], Producción industrial [33:53], Confianza del consumidor / empresarial (IFO) [13:10, 33:58].
* **Empleo:** *Non-Farm Payrolls* (NFP - primer viernes de mes) [14:25, 34:02], Tasa de desempleo [34:07], Ingresos medios por hora (presión salarial) [34:10], Peticiones semanales de subsidio [34:13], Tasa de participación laboral [34:16].
* **Inflación:** IPC general y subyacente [20:10, 34:25], IPP (precios al productor, anticipa presiones en cadena) [34:28], PCE (gasto de consumo personal, «el preferido de la Fed») [34:33], Costes laborales y expectativas de inflación [34:43].
* **Tipos de interés:** Reuniones y decisiones de tipos del banco central [34:55], Actas del FOMC [35:05], Discursos de banqueros centrales (Powell, Lagarde) [35:08], Futuros sobre tipos y diferencial de tipos/swaps [35:18].

---

#### 2) Formación de tesis y momento de entrar (papel del precio y confirmación)

* **Formación de la tesis:** Se basa en adelantarse a los datos oficiales macroeconómicos mediante indicadores adelantados (como usar los PMIs para proyectar hacia dónde saldrá el PIB trimestral [06:40 - 07:45]) y situarse en la fase correcta del ciclo económico [09:35].
* **Anticipación frente a «tirar líneas»:** Subraya que los mercados financieros descuentan el futuro [28:45]. Su método busca posicionarse con antelación:  
  * *Oído [37:12 - 37:21]:* «Tomar decisiones y anticipar tus movimientos pues permite posicionarse adecuadamente en los mercados, norma número uno de cualquier inversor. Si entiendes y sabes hacia dónde va, te posicionas antes. No hay más historia. No va a tirar líneas».
* **Papel del precio y gráficos:** En este episodio **no se muestra ningún gráfico de trading, ni gatillos técnicos de entrada, ni reglas de confirmación de precio**. Dani Curto advierte explícitamente al inicio [00:26 - 00:50] y a lo largo de la clase [06:55, 37:40] que este capítulo es estrictamente teórico-conceptual y que el paso a los gráficos y los ejemplos prácticos se enseñarán en el episodio 3 y siguientes.

---

#### 3) Reglas de tamaño, concentración y gestión del riesgo

* **El vídeo NO contiene reglas de tamaño de posición (*position sizing*), concentración porcentual de cartera ni gestión de riesgo monetario (stop losses o ratios R:R).** El ponente no menciona fórmulas cuantitativas al respecto en este episodio; se centra exclusivamente en el marco macroeconómico y remite los detalles operativos a su formación privada (*Pro Trader*) [07:10, 38:08].

---

#### 4) Afirmaciones concretas y razonamiento causal

* **Tipos de interés y Bancos Centrales:**
  * Los tipos son el precio del dinero y la herramienta reguladora principal [24:35 - 25:10].
  * Los bancos centrales persiguen una inflación de equilibrio en torno al 2% [20:45].
  * Crítica a la ejecución de los bancos centrales: *«Los bancos centrales intentan equilibrar (...) pero estos siempre se van a pasar de frenada, ya os lo digo yo»* [36:45 - 36:55].
* **Divisas:**
  * El valor de una divisa refleja la salud económica fundamental relativa de un país [12:50 - 13:00].
  * Siempre se opera en valor relativo: una divisa contra otra (ej. en el par EUR/USD no se evalúa el dólar de forma aislada) [04:20, 32:05 - 32:15].
  * Bajar tipos tiende a depreciar la divisa por política expansiva, aunque enfatiza que no hay fórmulas fijas matemáticas y todo depende del contexto [26:30 - 27:00].
* **Oro:**
  * Actúa como activo refugio y reserva de valor frente a la inflación y la pérdida de poder adquisitivo del dinero fiduciario [23:15, 32:15].
  * Su comportamiento es dispar: si la inflación sube pero los tipos se mantienen altos, el coste de oportunidad lo frena; en estanflación, en cambio, es donde mejor se comporta [32:35, 33:10].
* **Materias primas y Petróleo:**
  * Las materias primas y los costes energéticos son identificados como los causantes directos de la «inflación de costes» [22:15 - 22:25]. No analiza el petróleo de manera individual en este capítulo.
* **Aranceles y Estanflación (EE.UU.):**
  * Señala que imponer aranceles genera inflación importada y declara: *«Está bien, Trump, aranceles, no sé qué. Pero es coger una pistola y apuntarte a tu propio pie»* [23:50 - 24:00].
  * Comenta que la situación macroeconómica de EE.UU. a la fecha de grabación refleja condiciones típicas de estanflación [32:25 - 32:40].

---

#### 5) Errores que reconoce y lección aprendida

* **Error personal reconocido:** Reconoce que en sus inicios operaba ignorando la macroeconomía y apoyándose únicamente en análisis técnico:
  * *Oído [28:02 - 28:25]:* «Y vosotros me estáis diciendo y levanto la mano porque me incluyo cuando yo empecé. Pero señores, estamos hablando de que nosotros esto no lo teníamos en cuenta. Y vosotros estáis yendo a ciegas, estáis haciendo simplemente un 10% que equivale a una estrategia a nivel técnico y sí, se puede ganar dinero, pero no entendéis el porqué».
* **Lección extraída:** El análisis técnico por sí solo deja al operador desprotegido («yendo a ciegas»); para tener consistencia y justificar los movimientos del precio es indispensable entender el 90% restante, que es el trasfondo macroeconómico y el ciclo.

---

#### 6) Frases memorables literales (en inglés)

* **El vídeo se imparte íntegramente en español.** Daniel Curto **no pronuncia oraciones ni citas completas en inglés**.
* Únicamente introduce anglicismos técnicos sueltos del vocabulario económico:
  * *«Non Farm Payrolls»* [14:26]
  * *«Bearish o Bullish»* [18:28]
  * *«Hawkish y Dovish»* [18:35]
  * *«Pro Trader»* [07:10, 18:40, 26:30, 38:08]
  * *«QT, QE»* (*Quantitative Tightening*, *Quantitative Easing*) [30:30]

## 3 · Iniciación a la macroeconomía. Episodio 3/5
https://www.youtube.com/watch?v=APuebOwX9Bc · 51 min

A continuación se detalla de forma exhaustiva el método operativo y macroeconómico expuesto por Daniel Curto en este episodio («Capítulo 3: Ciclos económicos»), indicando minuciosamente lo que se expone, lo que se muestra en pantalla y lo que expresamente no se incluye.

---

#### 1) Variables macroeconómicas que analiza, orden y combinación

* **Inexistencia de un orden rígido o «ABC»:** Daniel Curto insiste repetidamente en que en la economía y en el mercado no existe una fórmula rígida lineal o «ABC» (*[08:12]*; *[09:44]*; *[34:45]*). No analiza las variables en un orden secuencial fijo (liquidez $\rightarrow$ bonos $\rightarrow$ dólar $\rightarrow$ bolsa), sino como un conglomerado interconectado («efecto dominó» *[01:14]*) agrupado en cuatro motores macroeconómicos (*[00:40]*):
  1. **Crecimiento:** PIB (*GDP*) y PMIs (indicador adelantado: $>50$ expansión, $<50$ contracción) (*[00:48]*, *[12:57]*).
  2. **Empleo:** NFP (*Non-Farm Payrolls*), ADP (empleo privado), tasa de desempleo y salarios (*[00:58]*, *[38:48]*, *[43:52]*).
  3. **Inflación:** IPC general e IPC subyacente (*[01:05]*, *[43:40]*).
  4. **Política monetaria:** Tipos de interés de los bancos centrales y crédito bancario (*[01:08]*, *[13:30]*).

* **Diagnóstico de las 4 fases del ciclo económico (cómo las combina):**
  * **Expansión (*[10:10]*, *[17:11]*):** Crecimiento del PIB al alza, desempleo cayendo gradualmente, confianza del consumidor y crédito bancario aumentando. Activos: momento idóneo para sobreponderar renta variable (sectores cíclicos/tecnología como Nasdaq *[24:35]*), dólar fuerte si EE. UU. lidera el crecimiento *[25:18]*, divisas exportadoras/emergentes suben *[25:31]*, oro plano o bajista *[25:46]* y bonos caen en precio (sube su rentabilidad anticipando subidas de tipos *[26:20]*).
  * **Pico (*[12:38]*, *[19:00]*, *[27:12]*):** Inflación por encima del objetivo central (~2%), desaceleración de PMIs (aún $>50$, pero bajando mes a mes) *[19:30]*, aplanamiento o inversión de la curva de tipos de interés *[20:00]*, valoraciones bursátiles en máximos históricos con mayor volatilidad *[20:25]*, y políticas monetarias restrictivas (subida o mantenimiento de tipos altos *[28:03]*). Decisión: reducir exposición a riesgo (salirse de bolsa/Nasdaq *[29:14]*) e incrementar defensivos/oro/bonos *[29:18]*.
  * **Recesión (*[13:45]*, *[20:45]*, *[29:45]*):** Recesión técnica definida como PIB negativo durante al menos dos trimestres consecutivos (6 meses) *[13:48]*, aumento significativo del desempleo, caída en producción industrial y crédito bancario. Caídas de bolsa del 20% al 50% *[30:45]*. Activos refugio al alza (oro, CHF, JPY *[31:00]*, bonos soberanos *[31:52]*). Los bancos centrales intervienen con recortes de tipos y estímulos monetarios *[30:26]*.
  * **Recuperación (*[14:50]*, *[21:50]*, *[33:50]*):** Los PMIs rebotan hacia 50 tras los recortes de tipos, el desempleo se estabiliza y la confianza empresarial mejora *[21:55]*. Las bolsas rebotan con fuerza meses antes de que los datos confirmen la recuperación *[35:42]*. El oro pierde atractivo *[36:35]*.

* **Cómo combina los datos en la práctica (Visto y oído en pantalla):**
  * *[42:35] - [44:45]*: Muestra en pantalla un informe macro de Reino Unido que consolida en un único cuadro: PIB anual, inflación general y subyacente, tasa de desempleo, salarios, tipos de interés del Banco de Inglaterra, confianza empresarial, PMI de servicios, ventas minoristas, PMI manufacturero y curva de bonos/swaps. Con ello evalúa si el sesgo neto de la libra es de debilidad o fortaleza frente a expectativas de tipos.
  * *[45:15] - [47:50]*: Muestra en pantalla el calendario de EE. UU. combinando datos contradictorios (PMI de servicios $>50$ vs. manufacturero $<50$; ADP empleo privado muy negativo vs. NFP y desempleo resilientes; PIB trimestral negativo previo). Concluye que EE. UU. se encuentra en un «pico tardío» (*[41:04]*, *[46:12]*).

---

#### 2) Formación de la tesis, papel del precio/gráfico y decisión de entrada

* **La tesis define la dirección macro:** El análisis macroeconómico no adivina el día a día, sino que otorga el sesgo direccional puro y descuenta el futuro con meses de antelación (en junio/julio se posiciona con vistas a octubre/noviembre, *[36:18]*). 
* **Comparativa macro relativa:** En Forex, la tesis surge siempre de contraponer dos economías (*[28:44]*). 
  * *Ejemplo Euro vs. Franco Suizo [31:10] - [31:35]:* Si la economía europea entra en contracción y el franco suizo actúa como activo refugio, la dirección fundamental inequívoca de EUR/CHF es bajista.
  * *Ejemplo Euro vs. Dólar [47:10] - [47:25]:* Si la tesis es que el euro está fuerte/estable y el dólar débil, se descartan ventas y únicamente se buscan compras en EUR/USD.
* **Papel del precio / gráfico técnico:**
  * Oído: Daniel Curto afirma taxativamente que la estrategia técnica representa únicamente un **10%** del total del trading (*[08:05] - [08:15]*); el 90% restante es contexto macroeconómico.
  * Crítica al *Price Action* tradicional (*[05:18]*, *[06:20] - [06:35]*): Critica esperar a que «rompa una zona o línea de soporte/resistencia para entrar», porque para cuando rompe, el movimiento ya es tarde y el mercado ya lo ha descontado.
  * *[31:30] - [31:45]*: Afirma que una vez obtenida la dirección macro, «ya no me hace falta ver si el suelo, el soporte, el killer block o el FVG».
  * *[49:15] - [49:25]*: En pantalla muestra el gráfico de USD/CHF en temporalidad de 4 horas (H4) con múltiples posiciones en corto (ventas swing), pero especifica: «No vamos a entrar en estrategias [técnicas]», dejando claro que el gatillo exacto no es el objeto de esta sesión, sino el posicionamiento a favor de la macroeconomía.

---

#### 3) Reglas de tamaño, concentración y gestión del riesgo

* **Lo que dice textualmente sobre gestión y posicionamiento:**
  * En fase expansiva: «...aprovechan esta fase para sobreponderar acciones de calidad o ir haciendo compras, DCA, promediar, llamadlo como queráis... ir cargando más beneficio, cargo, beneficio, cargo, beneficio» (*[26:37] - [26:55]*).
  * En fase de pico: «...sugiere una precaución y una reposición gradual hacia activos de menor riesgo... implementar los ajustes de una manera gradual» (*[41:06] - [41:28]*).
  * Sobre las pérdidas en cuentas: «...sí, se pierde, claro que se pierde, pero fijaros luego haciendo bien las cosas cómo se va sumando» (*[49:38] - [49:45]*).
* **Lo que NO se muestra ni se dice (Carencia en el vídeo):**
  * El vídeo **no menciona ninguna regla matemática de tamaño de posición** (lotaje, apalancamiento, porcentaje exacto de riesgo por operación como 1% o 2%), ni límites específicos de concentración de capital por activo o reglas numéricas de *stop loss*.

---

#### 4) Afirmaciones concretas sobre activos y razonamiento causal

* **Divisas:**
  * El mercado Forex es una comparativa bidireccional constante (*[28:44]*).
  * Países exportadores de materias primas (AUD, NZD, CAD) se aprecian en expansiones y recuperaciones (*[25:31]*, *[37:05]*).
  * Monedas refugio: el Franco Suizo (CHF) y el Yen Japonés (JPY) se fortalecen cuando la Eurozona o el mercado global sufren incertidumbre (*[31:05] - [31:25]*).
  * Protección de ahorros: comenta que un ahorrador que convirtió sus dólares a euros a inicios de año protegió su patrimonio simplemente por la apreciación del euro frente al dólar (*[41:50] - [42:15]*).
* **Tipos de interés y bancos centrales:**
  * Tipos bajos abaratan el crédito, inyectan liquidez y ponen dinero en circulación, reactivando la inversión y el consumo (*[15:05] - [16:20]*).
  * Tipos altos encarecen el crédito para enfriar la economía y controlar la inflación, limitando la inversión empresarial (*[13:30]*, *[21:30]*).
  * Mención política: menciona que Jerome Powell (Fed) se enfrenta a la presión de Donald Trump, quien quiere que se bajen los tipos de interés (*[32:48] - [32:56]*).
* **Oro:**
  * En expansión cae o se estanca porque los inversores buscan activos de mayor rentabilidad (bolsa/tecnología) (*[25:46] - [26:15]*).
  * En pico y recesión repunta con fuerza como activo refugio (*[28:25]*, *[30:55]*).
  * En recuperación pierde atractivo a favor de los activos de riesgo (*[36:35] - [36:45]*).
* **Petróleo:**
  * En momentos de contracción extrema y confinamiento cotizó en negativo, generando oportunidades extraordinarias de compra a largo plazo para inversores con horizonte temporal amplio (*[33:20] - [33:45]*). Relaciona a Canadá como exportador clave de petróleo y oro (*[37:10]*).
* **Bonos (Renta fija):**
  * Relación inversa básica: si el precio del bono cae, su rendimiento (*yield*) sube (*[26:22]*, *[37:32]*).
  * La curva de tipos invertida o plana es un síntoma de pico del ciclo y aviso de recesión (*[20:00]*, *[39:35]*).
  * En recesión, los bonos soberanos de alta calidad suben de precio por la búsqueda de seguridad y los recortes de tipos (*[31:50] - [32:05]*).

---

#### 5) Errores que reconoce y lecciones que extrae

* **Errores personales del autor:**
  * En este vídeo específico **no confiesa ningún fallo operativo personal pasado ni quiebra de cuenta propia**.
  * Únicamente expone que su porcentaje de acierto en el panel de fondeo mostrado (*[50:08]*) es de un 70%, comentando que es «un poquillo bajo para lo que acostumbro».
* **Errores comunes de los traders que denuncia y lecciones:**
  1. *Operar con indicadores rezagados:* El 99% de medias móviles o RSI van detrás del precio (*[06:45] - [06:55]*).
  2. *Esperar confirmaciones tardías de Price Action:* Entrar cuando el precio ya rompió una zona técnica hace entrar tarde, porque el dato macro ya ha sido descontado por el mercado institucional (*[06:20] - [06:35]*).
  3. *Pretender un «ABC» lineal:* Creer que si la inflación baja, mecánicamente el dólar siempre debe subir; explica que el impacto depende estrictamente de la fase del ciclo en la que se produzca (*[34:40] - [35:05]*).
  4. *Operar la noticia en el minuto de su publicación:* Creer que el fundamental sirve para operar la vela de los datos a las horas en punto del calendario económico en vez de posicionarse meses antes (*[36:00] - [36:30]*).

---

#### 6) Frases memorables literales (en inglés) con minuto

El vídeo está impartido íntegramente en español, pero Daniel Curto utiliza anglicismos y expresiones técnicas literales en inglés en momentos clave:

1. **[27:24]:** *«fear of missing out»* (empleada para describir la euforia y el miedo a quedarse fuera que sienten las masas en los picos del mercado antes de las caídas).
2. **[05:18]:** *«Price Action»* (utilizada al contrastar su método macro con la operativa tradicional de acción del precio).
3. **[09:18]:** *«FVGs, order blocks»* (utilizada para criticar que los traders busquen patrones técnicos menores como *Fair Value Gaps* y *Order Blocks* ignorando el ciclo macro).
4. **[18:02]:** *«carry trade»* (mencionada al explicar las operaciones basadas en el diferencial de tipos de interés entre dos divisas).
5. **[49:29]:** *«funded»* («...esto es una cuenta funded...», al mostrar en pantalla su panel de usuario de una empresa de fondeo con un retiro tramitado).

## 4 · Iniciación a la macroeconomía. Episodio 4/5
https://www.youtube.com/watch?v=Aotq7U0gGzY · 39 min

El vídeo corresponde a una clase teórico-práctica sobre cómo interpretar y operar noticias macroeconómicas dentro de una estrategia de trading fundamental e institucional. A continuación se desglosa el método de Daniel Curto de forma exhaustiva, separando lo que se escucha de lo que se visualiza en pantalla y señalando qué elementos no aparecen en el metraje.

---

#### 1) Variables macro que mira, orden de jerarquía y combinación

* **Inexistencia de un orden rígido o lista fija [05:25 - 05:45]:** Daniel afirma explícitamente que no existe una lista donde una noticia siempre esté por encima de otra (*«Yo no voy a venir a deciros esta, esta y esta son más importantes, porque os estaría mintiendo... dependiendo el contexto unas tendrán más peso que otras»*).
* **Los cuatro motores y cuatro datos clave [04:30 - 07:35]:**
  * *Cuatro motores estructurales:* Crecimiento, empleo, inflación y política monetaria [04:31].
  * *Los únicos 4 datos que cambian tendencias macro:* Tipos de interés, inflación (IPC), PIB y empleo (NFP) [26:38 - 26:55]. Otros datos con tres estrellas (ej. inventarios de petróleo o ventas de viviendas) no tienen esa relevancia estructural [05:00 - 05:20].
  * *Indicadores analizados:* IPC/IPC subyacente (presiones estructurales sin energía/alimentos) [05:50], NFP (consumo y decisiones Fed) [06:11], PMI (indicador adelantado; >50 expansión, <50 contracción) [06:33], PIB (indicador retrospectivo de validación) [07:11].
* **Los 3 pilares causales de la narrativa [09:50 - 10:50]:** Todo dato se somete a 3 preguntas en orden:
  1. *Tipos de interés / Política monetaria:* ¿Cómo afectará a las decisiones de tipos del banco central? [09:58]
  2. *Crecimiento económico:* ¿Acelera o desacelera la actividad/consumo? [10:15]
  3. *Inflación:* ¿Genera presiones inflacionarias o deflacionarias? [10:30]
* **Mecánica de combinación e impacto en activos (efecto dominó) [12:00 - 14:05 / 18:30 - 18:55]:**
  * Ante una sorpresa inflacionaria al alza:
    1. *Expectativas de política monetaria:* Se asume política restrictiva durante más tiempo [12:05].
    2. *Divisa (USD):* Se fortalece frente a otras monedas [12:30].
    3. *Renta variable (Nasdaq, S&P 500):* Cae, penalizando activos de crecimiento [13:31, 18:45].
    4. *Bonos:* Suben los rendimientos (*yields*) [13:48, 18:42] (se aclara verbalmente que rendimiento ≠ precio).
    5. *Metales y refugios (Oro):* Caen por la fortaleza del dólar y el alza de rentabilidades [13:58, 18:47].

---

#### 2) Formación de tesis, decisión de entrada y papel del gráfico

El método se estructura operativamente en tres fases: **Antes, Durante y Después** [19:55]:

* **Fase 1: Antes del dato (Formación de la tesis) [20:25 - 22:50]:**
  * *Consenso vs. Dato Anterior:* Establecer el punto de referencia del consenso de analistas cualificados [20:45 - 21:15].
  * *Narrativa y ciclo:* Identificar la fase cíclica y la sensibilidad del mercado (discernir si el mercado está guiado por macro o por ruido geopolítico/aranceles) [21:20 - 22:00].
  * *Planificación de los 3 escenarios:* Definir de antemano qué hacer si el dato sale mejor de lo esperado, peor o en línea. La regla fundamental es *«no casarse con nadie»* [22:05 - 22:30].
* **Fase 2: Durante la publicación (Momento de entrada y filtros) [22:55 - 26:25]:**
  * *No precipitarse [23:58]:* La reacción inicial de los primeros segundos/minutos está dominada por algoritmos de alta frecuencia (HFT) que se benefician de la apertura de *spreads* [23:18 - 23:55].
  * *Barridos de liquidez:* Los primeros movimientos suelen ser erráticos para sacar los *Stop Loss* habituales del minorista antes del verdadero desplazamiento [24:00 - 24:30].
  * *Confirmación gráfica y precio:* Rechaza frontalmente operar de forma mecánica patrones fijos como *order blocks* al 50% con ratios fijos 1:2 [12:40 - 13:00, 34:50]. El gráfico no se utiliza para adivinar, sino para confirmar mediante **volumen y estructura** [24:32].
  * *Herramientas de volumen:* Exige el uso de herramientas de flujo de órdenes como deltas positivos y negativos (comparativa compradores vs. vendedores) [24:45 - 25:05].
  * *Vigilancia de revisiones:* Comprobar si la oficina estadística (ej. BLS en EE.UU.) revisa el dato anterior al publicar el actual (manipulaciones o correcciones frecuentes en el NFP) [25:10 - 25:55].
  * *Arbitraje de coherencia intermercado:* Si la tesis fundamental dicta caída del USD pero el oro también cae en el primer impulso, Daniel espera a que el oro termine de buscar su nivel de liquidez para entrar en largo a favor de la macro [26:05 - 26:22].
* **Fase 3: Después de la publicación (Seguimiento) [26:30 - 28:20]:**
  * Evaluar si hay continuidad estructural o reversión tras disiparse la volatilidad inicial [26:35].
  * Contrastar con las comparecencias y ruedas de prensa posteriores de miembros de los bancos centrales (*forward guidance*) [27:18].

---

#### 3) Reglas de tamaño, concentración y gestión del riesgo

* *Lo que NO dice el vídeo:* Daniel **no proporciona reglas numéricas específicas de tamaño de posición (ej. % de riesgo fijo, lotajes exactos o fórmulas cuantitativas) ni límites porcentuales de concentración de cartera**. Remite a que la gestión monetaria detallada se enseña en su formación privada de pago (*Pro Trader*) [38:45 - 38:55].
* *Reglas y conceptos institucionales expuestos:*
  * **Cobertura estratégica con derivados [29:10 - 29:22]:** Señala que el enfoque institucional protege carteras contra escenarios adversos mediante instrumentos derivados como opciones financieras (*puts*, *calls*).
  * **Regla de ventanas de exclusión temporal en prop firms [30:25 - 30:40]:** Cita la norma de las empresas de fondeo de *«no operar 2 minutos antes y 2 minutos después de la noticia»*, advirtiendo contra la imprudencia de buscar apuestas instantáneas.
  * **Ubicación de Stops [24:15 - 24:30]:** Advierte que no hace falta que las instituciones vean las pantallas de los minoristas para saber dónde está colocado el 99% de los *Stop Loss*; entrar sin confirmación de volumen y estructura garantiza ser barrido.

---

#### 4) Afirmaciones causales sobre divisas, tipos, oro, petróleo y bancos centrales

* **Tipos de interés y Bancos Centrales:**
  * El objetivo primordial de la Fed y bancos centrales es mantener la inflación en torno al **2%** [14:58].
  * Si la inflación no cede al ritmo esperado, los bancos centrales se ven forzados a retrasar los recortes de tipos y mantener una política restrictiva más alta durante más tiempo para enfriar la economía [12:00 - 12:20, 17:00 - 17:40].
  * *Expectativas vs. Realidad:* «*Los mercados descuentan expectativas futuras, no condiciones actuales*» [35:32 - 35:45].
* **Divisas y Carry Trade (USD / JPY) [17:58 - 18:25]:**
  * Explica el mecanismo del *carry trade*: Japón mantiene tipos de interés ultrabajos; los operadores piden prestado yenes a coste casi nulo (*«dinero gratis»*), venden JPY e invierten ese capital en bonos de EE.UU. con tipos elevados. Esto provoca la subida sostenida del USD/JPY durante esa fase cíclica.
* **Oro y metales preciosos:**
  * Reacción ante tipos altos/dólar fuerte: El oro cae por la fortaleza del USD y el coste de oportunidad frente al rendimiento de los bonos [13:58, 18:47].
  * Reacción ante debilidad económica (empleo NFP bajo): El oro y la plata experimentan un *rally* al actuar como activo refugio y descontarse una pausa o recorte de tipos [33:15 - 33:25].
* **Petróleo [05:00 - 05:20]:**
  * Cita explícitamente los inventarios de petróleo para subrayar que no son datos que cambien el rumbo macroeconómico ni tienen el mismo impacto que el IPC o el NFP, a pesar de que los calendarios les asignen la categoría de "alto impacto" (tres estrellas).

---

#### 5) Errores que reconoce y lecciones extraídas

* **Error personal 1: Operar con FOMO e intentar frenar velas impulsivas [30:45 - 31:15]:**
  * *Reconocimiento:* Admite haber cometido el error de meter cortos impulsivos ante velas gigantes alcistas tras un dato de NFP (*«¿Cuántos de vosotros, y levantad la mano, y yo la levanto incluido, no habéis visto un NFP a lo bestia al alza, y cuando veis que sube mucho mucho mucho le metéis un corto?»*).
  * *Lección:* Compara esta conducta con *«poner la mano cuando se cae un cuchillo de la mesa»*. El FOMO ciega al operador; no se debe apostar a la adivinación ni perseguir la vela del minuto 1 [30:08, 30:58].
* **Error 2: Tratar el mercado como una receta técnica mecánica "ABC" [12:40 - 13:10 / 34:45 - 35:05]:**
  * *Lección:* Creer que siempre que hay un *order block* al 50% con ratio 1:2 el mercado va a reaccionar igual es infantil. Un dato idéntico puede provocar subidas en un ciclo y caídas en otro en función del contexto y de la sorpresa respecto al consenso.
* **Error 3: Analizar el dato en valor absoluto sin calibrar el consenso [08:15 - 08:40 / 09:05 - 09:25]:**
  * *Lección:* La magnitud del movimiento no la marca si el dato numérico subió o bajó respecto al mes anterior, sino la **desviación/sorpresa respecto a la previsión del consenso** [08:15, 35:20].

---

#### 6) Frases y términos literales en inglés con minuto

* **[31:06]:** *«...ese fomo, ese **Fear of Missing Out**, ese miedo a quedarte fuera...»* (pronunciado textualmente en audio).
* **[12:48 y 34:53]:** *«...la vela contraria antes del impulso que se llama **order block**...»*
* **[15:35]:** *«...lo que llamamos **Power Guidance** [forward guidance en pantalla]...»* (en la diapositiva y audio al referirse a la guía de tipos de los bancos centrales).
* **[17:59]:** *«...lo que está ocurriendo con el **carry trade**...»*
* **[27:57]:** *«Lo que llamáis todos **backtesting**, en macro se puede hacer.»*

## 5 · Iniciación a la macroeconomía. Episodio 5/5
https://www.youtube.com/watch?v=kGrcpf2tJkA · 27 min

En este vídeo (episodio final de la serie formativa, centrado en **«Geopolítica aplicada al trading»**), Daniel Curto expone el marco analítico geopolítico y su traslación a los activos financieros. A continuación se desglosa de manera exhaustiva el método aplicable expuesto, contrastando lo que se dice y lo que se muestra en pantalla, y señalando con precisión lo que no se aborda:

---

#### 1) Variables macro, orden de análisis y combinación
* **Jerarquía analítica de mercado [11:10 – 11:55]**:
  * *Oído:* Explica que la pirámide de análisis opera de menor a mayor profundidad causal:
    1. **Indicadores técnicos:** La capa más superficial y con menor poder explicativo.
    2. **Acción del precio (*Price action*, ICT, *Smart money*):** Movimientos técnicos derivados.
    3. **Macroeconómica:** Tipos de interés, inflación y empleo que determinan las tendencias de fondo.
    4. **Geopolítica (la raíz):** En la cúspide causal; sostiene que los eventos y tensiones geopolíticas son los que obligan a los bancos centrales a alterar la política monetaria (subir/bajar tipos de interés, inyectar o restringir liquidez).
* **Criterio de prioridad entre Geopolítica y Calendario Económico [14:55 – 15:45]**:
  * *Oído:* Pone la regla empírica: si hay un shock geopolítico inminente o bélico («*si veo misiles volar, lo que menos me importa es el IPC*»), la geopolítica anula y prima sobre los datos macroeconómicos estándar. Solo cuando no hay alertas geopolíticas activas se vuelve al análisis tradicional del calendario económico, noticias y ciclos.
* **Flujos de capital y aversión al riesgo [22:45 – 23:15]**:
  * *Oído:* En ciclos de aversión al riesgo moderada/alta, el capital se refugia en **renta fija** (bonos); en fases de mayor apetito por el riesgo, fluye hacia la **renta variable** (Nasdaq, S&P 500).
* *Lo que no se menciona:* El vídeo no establece un orden secuencial rígido que pase obligatoriamente por «beneficios corporativos o liquidaciones de la Fed» paso a paso, sino este orden jerárquico que va de la geopolítica/macro a los flujos y al gráfico.

---

#### 2) Formación de la tesis, confirmación y momento de entrada
* **Sorpresa frente a descuento del mercado [16:50 – 17:10 y 20:45 – 21:00]**:
  * *Oído:* Para formar la tesis, distingue si el evento geopolítico es un **factor sorpresa** (que desata el movimiento volátil real) o si es algo ya ampliamente anticipado/descontado por el mercado (como la subida previa del oro a máximos históricos antes de ataques conocidos entre Irán e Israel).
* **Confirmación por gráfico / Gatillo de entrada:**
  * *Oído / Visto:* Defiende que no se deben operar «solo velas» sino el contexto macro/geopolítico previo, durante y posterior [23:25 – 23:45]. 
  * *Omisión:* **No detalla gatillos técnicos específicos de entrada, patrones de velas ni indicadores concretos en el gráfico para confirmar la entrada** en este episodio (remite a su formación privada *Pro Trader*).

---

#### 3) Reglas de tamaño, concentración y gestión del riesgo
* *Omisión:* **El vídeo no expone reglas numéricas de tamaño de posición (*position sizing*), límites porcentuales de concentración de cartera ni fórmulas de stop loss o gestión del riesgo.** 
* *Oído [24:40 – 24:55]:* Únicamente menciona de pasada que él pasó dos fases de cuenta de fondeo y retiró 7.000 $ en cuatro días para demostrar que aplica sus conceptos, pero sin detallar parámetros de riesgo.

---

#### 4) Afirmaciones concretas sobre activos y razonamiento causal

* **Divisas (Dólar, Euro, Yen):**
  * **USD como activo refugio [11:00 – 11:05, 14:20 – 14:30, 21:05 – 21:15]:** El dólar estadounidense tiende a fortalecerse durante fases de incertidumbre global, con la excepción de que el conflicto involucre directamente la solvencia o seguridad de EE. UU.
  * **EUR/USD [10:40 – 11:10]:** *(Visto en diapositiva con gráfico de TTF Gas vs. EUR/USD)*. Los conflictos europeos (como la guerra de Ucrania) encarecen la energía en Europa, debilitan la competitividad del euro y provocan flujos de salida hacia el dólar.
  * **USD/JPY [21:00 – 21:50]:** Se comporta como canal intermedio de flujos entre renta fija y variable. Tiende a apreciarse por estatus refugio del USD y se beneficia estructuralmente del **Carry Trade** (pedir prestado en JPY a tipos de interés ultra bajos para invertir en USD a tipos altos, lo que describe como «dinero gratis»).

* **Tipos de interés y Bancos Centrales:**
  * **Presión sobre el BCE [07:30 – 08:30 y 11:00 – 11:10]:** Las crisis de suministros (gas) generan shocks inflacionarios de oferta combinados con contracción económica, obligando al Banco Central Europeo a tomar decisiones monetarias reactivas y restrictivas a remolque de la Fed [09:20 – 09:40].
  * **Prima de riesgo soberana [04:10 – 04:20 y 06:20 – 06:50]:** *(Visto en diapositiva)*. El diferencial entre el bono a 10 años de un país (ej. España) y el Bund alemán mide la gobernabilidad y confianza institucional; divergencias al alza reflejan fuga de confianza.

* **Oro [14:30 – 14:50 y 20:20 – 20:55]:**
  * *(Visto en pantalla en diapositiva "Aplicación práctica para traders")*: Plantea abrir **posiciones largas en oro** durante escaladas de tensión geopolítica internacional, con especial fuerza cuando involucran a potencias nucleares o elevan la incertidumbre general.

* **Petróleo y Gas Natural:**
  * **Petróleo [15:50 – 16:30]:** Reacciona de forma inmediata a tensiones en Oriente Medio, centrado en el cuello de botella del **estrecho de Ormuz**, por donde transita entre el 20 % y el 25 % del crudo mundial.
  * **Gas Natural [07:25 – 07:35 y 12:00 – 12:35]:** Disparos verticales en el gas ante cortes de suministro ruso, derivando en crisis de costes y contracción en Europa.

* **Bolsa / Sector Tecnológico (Nasdaq) [17:20 – 17:50 y 21:55 – 22:40]:**
  * *(Visto en pantalla)*: Alta vulnerabilidad del índice Nasdaq a la cadena de suministros de **semiconductores** entre EE. UU., China y Taiwán. Plantea monitorizar declaraciones oficiales sobre controles de exportación y aranceles (en webs como OTC) para anticipar debilidad o fortaleza en las tecnológicas.

---

#### 5) Errores que reconoce y lecciones extraídas
* *Omisión:* En este vídeo, Daniel Curto **no menciona errores operativos personales ni relata operaciones perdedoras pasadas**. Únicamente critica como error general de los traders minoristas operar gráficos sin entender el contexto geopolítico ni la economía real [23:20 – 23:35, 25:05 – 25:35].

---

#### 6) Frases memorables literales (en inglés)
* *Omisión:* El vídeo está grabado **íntegramente en español**. El ponente no pronuncia citas ni frases célebres en inglés (únicamente términos técnicos habituales de la jerga de trading como *«Price action»* [11:27], *«Smart money»* [11:32] o *«Carry trade»* [21:30]).

