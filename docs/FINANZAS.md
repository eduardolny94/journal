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

## API

- `GET /api/finanzas/movimientos?from&to&account_id&kind`, `POST`, `PUT /:id`, `DELETE /:id`.
- `GET /api/finanzas/resumen?from&to`.
- Tipos: gastos `evaluacion`, `reset`, `activacion`, `datos`, `plataforma`, `otro_gasto`; ingresos `retiro`, `reembolso`, `otro_ingreso`.
- Datos de ejemplo para el usuario demo: `node scripts/seed-finanzas.mjs` (servidor en marcha).

## Ideas siguientes

- Impuestos: porcentaje configurable para ver el neto después de impuestos.
- Recordatorios de cargos fijos y de vencimiento de evaluaciones.
- Objetivo mensual de retiros y progreso.
- Importar el historial de compras desde el correo o el panel de la prop firm.
