# Finanzas: el dinero real del trader de prop firms · 2026-09-17

Idea: el P&L del journal es dinero de la prop firm hasta que lo retiras. Lo que de verdad entra y sale de tu bolsillo es lo que pagas por cuentas (evaluaciones, resets, activaciones, datos, plataforma) y lo que cobras (retiros, reembolsos). La sección Finanzas registra eso y calcula lo que un negocio miraría.

## Qué registra

- **Movimientos** (`account_transactions`): tipo, cuenta (opcional; los datos de mercado suelen ser generales), fecha, importe neto, y en los retiros el bruto retirado, el reparto (split) y la comisión. Los gastos pueden marcarse como **fijos mensuales** (datos, plataforma).
- **Economía de cada cuenta** (campos nuevos en `accounts`): coste de la evaluación al crearla (se apunta como gasto automáticamente), fecha de compra, fecha en que pasó a financiada, fecha de cierre o quema, estado (activa, superada, quemada, cerrada) y reparto de beneficios.

## Qué calcula (`GET /api/finanzas/resumen`)

- Invertido, cobrado, resultado real, **ROI** sobre lo invertido y **% recuperado** (o cuánto falta para recuperar).
- Cuentas compradas, financiadas, quemadas y activas; **tasa de aprobación**; **coste por cuenta financiada** (evaluaciones + resets ÷ financiadas); días medios hasta financiada; retiro medio.
- **Valor esperado por evaluación**: tasa de aprobación × retiro medio por cuenta financiada − coste medio de la evaluación (cuando hay al menos 3 evaluaciones cerradas).
- Gastos fijos al mes; flujo de los últimos 30 días; flujo de caja mensual con acumulado; desglose por firma y por cuenta (incluido el P&L de trading de cada cuenta para verlo junto al dinero real).
- Lecturas automáticas en texto: qué te falta para recuperar la inversión, qué te cuesta cada cuenta financiada, si tu tasa de aprobación compensa, cuánto de lo ganado sigue dentro de las cuentas.

## Dónde está

- Página **Finanzas** (menú lateral): KPIs, lectura, flujo de caja, cuentas, gastos fijos, por firma, por cuenta y libro de movimientos con alta, edición y borrado.
- **Dashboard**: tarjeta "Dinero real" con invertido, cobrado, resultado y ROI.
- **Cuentas**: sección "Economía de la cuenta" en el formulario; estado y reparto en la tarjeta.

## Fondeos y payouts (certificados y comprobantes) · 2026-10-03

Pestaña **Fondeos y payouts** dentro de Finanzas: la historia de cada cuenta (compra → fondeo → payouts → cierre o quema)
con sus documentos en una galería iluminada sobre fondo oscuro.

- **Certificado de cuenta fondeada**: cuelga de la cuenta. Se sube desde Cuentas → Editar (aparece al poner la cuenta en
  estado «Superada», con fecha de fondeo o de tipo financiada) o desde la pestaña con «Subir certificado».
- **Comprobante de payout**: cuelga del movimiento de tipo `retiro`. Se sube desde el formulario del retiro o desde la
  pestaña con «Subir comprobante». El importe del payout ya suma en el Resumen; el comprobante solo lo documenta.
- Imagen (JPG, PNG, WEBP, GIF) o PDF, máx. 10 MB, uno por subida. Archivos privados en `uploads/<userId>/` como las
  capturas: solo el dueño los ve. Los PDF se abren en una pestaña nueva (la CSP no permite incrustarlos).
- Borrar la cuenta borra sus documentos; borrar el retiro borra su comprobante (fila y archivo).
- Avisos en la pestaña: cuentas fondeadas sin certificado y payouts sin comprobante.
- Las cuentas archivadas sí aparecen: esta vista es histórica. Dashboard y Operaciones, en cambio, excluyen las
  archivadas cuando no hay cuenta elegida (en Operaciones, la casilla «Incluir cuentas archivadas» las añade).
- Importar CSV vive en **Cuentas** (botón «Importar CSV» y Cuentas → Conectar), no en el menú ni en Operaciones.

## API

- `GET /api/finanzas/movimientos?from&to&account_id&kind`, `POST`, `PUT /:id`, `DELETE /:id`.
- `GET /api/finanzas/resumen?from&to`.
- `GET /api/finanzas/documentos?account_id&transaction_id&kind`, `POST` (multipart: `file`, `kind`, `account_id` o
  `transaction_id`, `title`), `PUT /:id` (título), `DELETE /:id`. Tipos: `certificado_fondeo`, `comprobante_payout`, `otro`.
- `GET /api/finanzas/fondeos`: totales (cuentas fondeadas, total y nº de payouts, mayor y último payout, documentos
  subidos y faltantes) y por cuenta: fechas, estado, certificados, payouts con sus comprobantes.
- Tipos: gastos `evaluacion`, `reset`, `activacion`, `datos`, `plataforma`, `otro_gasto`; ingresos `retiro`, `reembolso`, `otro_ingreso`.
- Datos de ejemplo para el usuario demo: `node scripts/seed-finanzas.mjs` (servidor en marcha).

## Ideas siguientes

- Impuestos: porcentaje configurable para ver el neto después de impuestos.
- Recordatorios de cargos fijos y de vencimiento de evaluaciones.
- Objetivo mensual de retiros y progreso.
- Importar el historial de compras desde el correo o el panel de la prop firm.
