# Salidas de la mesa

Una carpeta por fecha (`AAAA-MM-DD/`) con `paquete.json` (lo que leyeron los agentes ese día, sin los documentos
fijos) y una ficha por agente (`analista_macro.json`, `analista_flujos.json`, `jefe_de_mesa.json`). Las escribe el
motor (`server/src/mesa/index.js`) en cada pasada; la fuente de verdad para la pestaña Mesa y para la medición de la
fase 3 es la base de datos (`mesa_pasadas`, `mesa_fichas`). Estos archivos son la copia legible y revisable.
