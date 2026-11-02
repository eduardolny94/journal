# Protrader 5 · Sesión 5 con los mentores (17-06-2026) — síntesis y lo medido (03-11-2026)

Fuente: "Transcripción para IA" oficial (30 páginas, 17.869 palabras, 2 h). Clase en directo el día del **primer FOMC de
Kevin Warsh** (mantiene 3,75 %), con lectura en vivo del comunicado, las proyecciones y la rueda de prensa.

## Lo que enseñan (ideas con sustancia)

1. **"Los tipos dan igual, lo importante son las proyecciones."** La decisión estaba descontada desde hacía meses; lo que
   movió dólar arriba y Nasdaq y oro abajo fue el **SEP**: tipos esperados 2026 de 3,4 → 3,8 %, 2027 de 3,1 → 3,6 %, PCE
   2026 de 2,7 → 3,6 %. Cómo leerlo: tabla de medianas con la fila "proyección anterior" debajo; el dot plot, cada punto un
   miembro; el punto de largo plazo (≈3 %) es el tipo neutral. Se compara siempre con la proyección anterior.
2. **Warsh retira el forward guidance**: "los mercados funcionan mejor cuando reaccionan a los datos, no a lo que dice la
   Fed". Consecuencia para operar: **los datos van a mover más** y el mercado esperará menos a la Fed. No se moja en nada
   más ("Powell 2"): la inflación "elevada", mitad del comité quería tipos iguales o más bajos y mitad más altos.
3. **Contar los disidentes y ver si crecen** reunión a reunión (de 9-1 a 7-3 es la señal, no el voto suelto).
4. **Operar un dato**: esperar la primera media hora, comprobar en bonos y swap que el movimiento "no se devuelve", y entrar
   (GBPUSD corto tras el IPC británico). No dejar límites puestos sobre un dato: "te ventila".
5. **Stop**: 52 pips por defecto; **la mitad (25) en pares de poco rango** (GBPUSD "si mueve eso en un día"); en GBPNZD 52 se
   queda corto. Es decir, el stop va con el rango del par, no fijo.
6. **Segunda entrada** (Carlos): primera al punto H4 con 0,5 % de riesgo y stop 52; segunda a la mitad del stop con stop 25
   pips (mismo nivel de salida) y otro 0,5 %: si entra, el 1:1 pasa a ser ≈2,2R.
7. **Órdenes que no se activan**: es estadística; paciencia, 1-5 operaciones por semana (media 2), no bajar de marco ni
   perseguir el precio; jueves y viernes no se abren H4 nuevas.
8. **BoJ**: interviene el banco central/MoF, no "el gobierno"; no intervenir sería peor (abandonar el tipo de cambio
   gestionado); el yen débil importa inflación, pero no pueden subir mucho; vigilar el tramo largo de la curva japonesa.
9. **Risk-off**: el dinero va a renta fija (bonos largos) y sale de renta variable; subida de tipos → Nasdaq y oro abajo.
10. **Euro**: la subida del BCE estaba descontada ("no movió nada"); el foco del euro es la inflación y si se filtra a
    servicios; EURUSD lateral a expensas de la Fed.
11. **Cuentas de fondeo "nuevas" (Nova, Topstep con cap)**: siempre a favor de la empresa; drawdown que persigue = malo
    para swing; quedarse con los planes clásicos.

## Lo aplicado y lo medido aquí (03-11-2026)

- **Punto 1 aplicado**: el tono automático del dólar (sources/tono.js) lee ahora, en las reuniones con proyecciones
  (marzo, junio, septiembre, diciembre), la tabla de medianas del SEP y le pasa a Claude el cambio de tipos y de PCE frente a
  la proyección anterior. Una subida de la mediana de tipos es halcón aunque la decisión sea "mantener".
- **Punto 3**: el resumen del tono ya cita los disidentes; el histórico queda en radar_manual (nota "auto …").
- **Punto 5** ya estaba medido (sesión 3): stop fijo de 52,5 pips no; **0,5 ATR de H4 sí** (es el equivalente a "la mitad
  en pares de poco rango", pero medido). Punto 6 (segunda entrada) queda como candidato a medir en el backtest del swing.
- **Punto 2**: coherente con lo medido el 01-11 (la sorpresa explica la 1.ª hora; inflación deja deriva). Si Warsh cumple,
  esas cifras deberían subir: se vuelve a medir en 2027.
- **Punto 9**: el pilar de riesgo (S&P, VIX, petróleo) y la confirmación cruzada (bono 2 a, dólar, riesgo) ya lo recogen.
