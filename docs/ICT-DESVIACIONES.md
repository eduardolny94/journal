# Las "desviaciones estándar" de ICT como puntos de reacción (28-10-2026)

Pregunta de César: ICT proyecta el rango (o la pierna de manipulación) a −1, −2, −2,5 y −4 "desviaciones" y las usa como
objetivos y puntos de reacción; ¿por qué no están en el indicador? Respuesta: porque no estaban medidas. Medidas ahora con
`server/scripts/ict-desviaciones.mjs`: 10 pares FXCM, H1, 2015–2026, 29.163 días, 26.413 roturas de Asia y 17.977
manipulaciones (barrida y vuelta dentro antes de las 12:00 España).

Regla medida: cuando Londres rompe el rango de Asia (18:00–02:00 NY) por un lado, nivel k = borde roto + k × rango. Para la
pierna de manipulación: la barrida que vuelve dentro, proyectada k × pierna hacia el otro lado. "Reacciona" = vuelve medio
rango antes de seguir medio rango. Control: múltiplos que ICT no usa (1,37 · 1,75 · 3,1).

| Proyección del rango de Asia | Llega en el día | Al llegar, reacciona | Sigue |
|---|---|---|---|
| 1 (ICT) | 49 % | 45 % | 49 % |
| 1,37 (control) | 37 % | 44 % | 49 % |
| 1,75 (control) | 27 % | 44 % | 49 % |
| 2 (ICT) | 23 % | 45 % | 48 % |
| 2,5 (ICT) | 15 % | 42 % | 51 % |
| 3,1 (control) | 10 % | 42 % | 52 % |
| 4 (ICT) | 5 % | 44 % | 50 % |

Pierna de manipulación proyectada: en los múltiplos de ICT reacciona el 20–26 %, en los de control el 24–27 %.

Conclusión: **los múltiplos de ICT reaccionan exactamente igual que cualquier otro múltiplo** (42–45 % frente a 42–44 %). La
probabilidad de "llegar" baja con la distancia de forma continua, sin escalones en 1, 2, 2,5 o 4. No hay nada que meter en el
indicador: una línea a 2 rangos no es más punto de reacción que una a 1,75. Se suma a lo ya medido de CRT (docs/CRT-VIDEOS.md).
