# Sesiones ICT en hora de España

César vive en España. Las sesiones se definen en hora de Nueva York (ICT) y aquí van pasadas a hora de Madrid.
Regla: **España = Nueva York + 6** (invierno y verano), salvo dos desfases al año en que es **+ 5**: del último domingo de
octubre al primer domingo de noviembre, y del segundo al último domingo de marzo. Servidor MT5 (NY + 7) = España + 1.

| sesión (ICT) | Nueva York | **España (normal, NY + 6)** | semanas de desfase (NY + 5) |
|---|---|---|---|
| Asia (rango asiático) | 19:00 – 02:00 | **01:00 – 08:00** | 00:00 – 07:00 |
| Kill zone de Asia | 20:00 – 00:00 | **02:00 – 06:00** | 01:00 – 05:00 |
| Kill zone de Londres | 02:00 – 05:00 | **08:00 – 11:00** | 07:00 – 10:00 |
| Judas de Londres (barrida falsa de Asia) | 02:00 – 04:00, lo normal en la primera hora | **08:00 – 10:00, lo normal 08:00 – 09:00** | 07:00 – 09:00 |
| Kill zone de Nueva York | 07:00 – 10:00 | **13:00 – 16:00** | 12:00 – 15:00 |
| Apertura NY y datos de EE. UU. | 08:00 / 08:30 | **14:00 / 14:30** | 13:00 / 13:30 |
| Kill zone del cierre de Londres | 10:00 – 12:00 | **16:00 – 18:00** | 15:00 – 17:00 |
| Cierre del día (vela diaria) | 17:00 | **23:00** | 22:00 |

Lo que dicen nuestros datos (docs/ASIA-BARRIDO-ORO.md, docs/ORO-HORAS.md), en hora de España normal:
- La barrida de Asia (Judas) cae en la **primera hora de la kill zone de Londres (08:00–09:00)** el 24 % de los días por
  el alto y el 19 % por el bajo; si no, lo normal es entre las 11:00 y las 13:00, cuando llega el volumen.
- El oro apenas se mueve de 08:00 a 11:00 (16–17 % del ATR por hora); la expansión real es de **12:00 a 15:00**, con el
  máximo de 13:00 a 14:00. La kill zone de Nueva York es, en el oro, la que paga.
- El indicador GTFX · Velas de Asia lleva las sesiones ancladas a Nueva York, así que no hay que tocarlo con los cambios de hora;
  el sombreado 08:00/09:00 España solo se desalinea una hora en las semanas de desfase.
