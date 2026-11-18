# Protrader 5 · sesiones 7–12 y PDF «El ciclo de liquidez» — qué dice y qué aguanta en los datos (18-11-2026)

Fuentes: transcripciones oficiales «para IA» de las sesiones 7 a 12 y el PDF «El ciclo de liquidez y el sistema financiero
mundial» (material del curso; aquí solo ideas parafraseadas). Medido con `server/scripts/liquidez-fed.mjs` y
`server/scripts/protrader-7-12.mjs`. Reglas de la casa: n siempre, tres bloques, separación en activos con deriva.

## 1. Lo que enseña (resumen)

- **Bancos centrales.** El día de la decisión mueve lo que dicen, no el tipo (ya descontado). Antes: leer las dos últimas
  reuniones y el cambio de tono; mirar los bonos de 3 m, 6 m, 1 año y 2 años desde la última reunión. Corto sube y 2 años
  baja = subida corta sin ciclo → divisa lateral. Tipos ya en el rango neutral = fin de recortes.
- **Bonos.** De 3 meses a 5 años = expectativas del banco central; de 10 a 30 = inflación, crecimiento, déficit y oferta.
  Si el 2 años rompe una zona marcada en diario, se descuenta más movimiento. Mirar los dos bonos del par.
- **Datos.** Solo cuenta la sorpresa; un dato que no cambia las expectativas de tipos deja la divisa lateral. No
  mantener operaciones sobre el NFP. Los IPC nacionales del euro adelantan el de la eurozona.
- **Oro.** Primero tipos, después refugio. En un shock de liquidez cae con la bolsa.
- **Índices.** Cuatro pilares: liquidez/balance, beneficios, condiciones financieras, vientos de cola. KOSPI negativo →
  cortos en Nasdaq. Si bajan las expectativas de subida y el Russell no sube, no hay relajación real.
- **Liquidez (PDF).** Liquidez neta = activos de la Fed − cuenta del Tesoro (TGA) − repos inversos (RRP); «fuerte
  correlación» con S&P y Nasdaq. RRP cerca de cero = sin colchón. SOFR por encima del techo = estrés. Vigilar MOVE y VIX.
- **Calendario.** Mejores meses de mediados de enero a julio; agosto y diciembre los peores. Fin de trimestre: más mechas.
- **Gestión.** 1 % por operación (1,5 % máx.), stops amplios con objetivo 1:1 a 1:1,5, «no hay nada» es una respuesta
  válida, tras una pérdida no recuperar de golpe, retirar a menudo y no acercarse a los límites de la cuenta.

## 2. Medido

### Liquidez neta de la Fed (2010 → 2026, FRED: WALCL − WTREGEN − RRPONTSYD, usable desde el viernes)

| Qué | Resultado |
|---|---|
| «Fuerte correlación» en el mismo periodo (cambios a 13 semanas) | **No**: S&P −0,01, Nasdaq 0,08; van en el mismo sentido el 55–57 % de las veces (29 % en 2024–26). La correlación famosa es de niveles: las dos series suben con los años |
| ¿Anticipa a la bolsa? liquidez subiendo ≥ 1 % en 13 semanas frente a bajando, 20 sesiones después | **Sí en los tres bloques**: S&P sube 74,0 % frente a 62,7 % (+19,5 / +9,0 / +15,5; n 1.802 / 1.385); Nasdaq 74,0 % frente a 61,0 % (+18,3 / +10,2 / +17,5). Sin solapar (n 88 / 67) +16,9 y +17,6. Se mantiene con el índice por encima y por debajo de su media de 200. Rendimiento medio +1,5 % frente a +0,6 % (S&P) |
| Pero en 2024–26 | **Al revés**: S&P 70,1 % frente a 77,0 %; Nasdaq 67,8 % frente a 73,9 % (n 214 / 261, ≈ 11–13 observaciones independientes) |
| Dólar (DXY) a 20 sesiones | liquidez subiendo → sube 48,2 % frente a 58,8 % bajando (−14,5 / −5,3 / −19,5): más liquidez, dólar más débil, en los tres bloques |
| Oro | sin relación estable (−3,3; +2,7 / +2,2 / −5,7) |
| Sobre el sesgo del radar en los pares con dólar | a favor 58,7 % frente a 56,4 % en contra a 20 días, pero por bloques 61,0 / 54,7 / 61,2 frente al total 61,8 / 52,2 / 56,9: **no mejora en los tres**. EURUSD 68,3 % frente a 56,9 % y GBPUSD 61,9 % frente a 54,7 %; USDJPY al revés (61,8 % frente a 66,4 %) |
| Válvulas hoy | RRP vacío desde finales de 2025 (2.200 mil M$ en 2022 → 0,2); SOFR − IORB de −10 pb (2021) a +3 pb; SOFR por encima del techo 61 días desde 2018; los últimos episodios, de septiembre a diciembre de 2025. La liquidez neta: 5.844 mil M$, +0,8 % en 13 semanas, −0,5 % en 4 |

### El resto

| Regla del curso | Medido | Veredicto |
|---|---|---|
| El 2 años rompe una zona → la divisa sigue | Con el sesgo del radar: rompe a favor (60 sesiones) 54,6 % a 20 días frente a 57,2 %; rompe **en contra** 60,9 % (69,2 / 60,8 / 55,4). A 5 días a favor 56,3 % frente a 54,7 % | A 20 días ya está en el precio; coincide con la condición «bono a 2 años en contra» que ya usa la claridad |
| Mejores meses enero–julio, peores agosto y diciembre | Radar: enero–julio 56,5 %, agosto y diciembre 60,3 %. Julio es el peor mes del sesgo (41,4 %; 58,7 / 40,8 / 32,0; 16 julios). Índices: agosto −0,1 % y septiembre −0,7 % sí son flojos; julio es el mejor (+2,6 %, 82 % de los años); octubre y noviembre fuertes | En FX no; en bolsa solo agosto–septiembre |
| KOSPI negativo → cortos en Nasdaq | Sesión de contado del Nasdaq: sube 55,0 % tras KOSPI alcista y 53,8 % tras bajista (+2,5 / +1,4 / −0,9). En 2024–26, tras KOSPI ≤ −1 % el Nasdaq sube 51,6 % (+0,12 %) y tras ≥ +1 % 49,5 % (−0,11 %) | No |
| Bajan las expectativas y el Russell no acompaña → bajista | 2 años cae ≥ 10 pb en 5 sesiones: con el Russell bajando el S&P sube después 65,8 % frente a 59,4 % con el Russell subiendo (−13,9 / −15,4 / −5,5); Nasdaq igual (n 170 / 202) | Al revés a 5 sesiones; sin patrón a 20. (Aproximación: bono a 2 años en lugar de FedWatch) |
| Vigilar MOVE y VIX | MOVE subió ≥ 15 % en 20 sesiones: el sesgo del radar acierta 57,1 % a 3 días frente a 53,8 % (57,9 / 56,2 / 57,2 frente a 55,2 / 51,3 / 54,9; n 3.156), con y sin las condiciones de buen momento; mejor que el total del año en 10 de 16. VIX en el 20 % bajo del año: 54,3 % a 20 días (59,0 / 45,8 / 57,2). En índices el MOVE no separa | El sesgo funciona mejor con el mercado movido que en calma. **Candidata** para «a 3 días» |
| Fin de trimestre | Sesgo a 5 días 58,1 % frente a 54,9 %. S&P: las 5 sesiones previas sube 52 % frente a 61 % normal; las 5 siguientes 64 % (n 67) | Se opera igual, como dice el curso |

No medible con lo que hay: la forma de la curva corta por país (faltan 3 m, 6 m y 1 año de cada uno), los IPC nacionales
del euro como adelanto (falta histórico del calendario), FedWatch histórico, dark pools, MOC.

## 3. Qué se saca para el radar

1. **Liquidez de la Fed como pilar a peso 0 en Nasdaq, S&P y Dow** (y línea «válvulas»: RRP, SOFR − IORB). Pasa los tres
   bloques, pero falla en 2024–26, así que se enseña y se vigila; no puntúa.
2. **MOVE subiendo como condición candidata de «Hoy · a 3 días»**. Pasa bloques; por años 10 de 16. Vigilada.
3. **Lectura de noticias**: ya hace lo que pide el curso (sorpresa, descontado, 2 años). Añadible sin medir nada: comparar
   el tono de las actas con el de la reunión anterior, y guardar desde hoy los IPC de Alemania, Italia y España junto al
   de la eurozona para medir si lo adelantan.
4. **Nada de**: KOSPI, Russell como confirmación, meses del año en FX, ruptura del 2 años como continuación a 20 días,
   liquidez sobre los pares con dólar (solo EURUSD y GBPUSD, sin n suficiente).
