// Mesa de agentes · contrato de salida (mesa-agentes/formato/salida.schema.json) en dos piezas:
//   · ESQUEMA_SALIDA: la versión que se envía a la API como salida estructurada (sin límites numéricos ni de longitud,
//     que la API no admite; todos los objetos cerrados con additionalProperties:false).
//   · validarFicha(): los límites del contrato original comprobados aquí (sesgo −2..+2, confianza 0..100, longitudes,
//     símbolos del universo). Devuelve la lista de errores en español.
export const AGENTES = ['analista_macro', 'analista_flujos', 'jefe_de_mesa'];

export const ESQUEMA_SALIDA = {
  type: 'object',
  additionalProperties: false,
  required: ['fecha', 'agente', 'version_fichas', 'pares', 'eventos', 'nota_jefe'],
  properties: {
    fecha: { type: 'string', description: 'AAAA-MM-DD del paquete' },
    agente: { type: 'string', enum: AGENTES },
    version_fichas: { type: 'string', description: 'Versión de fichas/divisas.md usada' },
    pares: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['symbol', 'sesgo', 'confianza', 'horizonte_dias', 'motivos', 'invalidacion', 'evento_clave', 'coincide_radar', 'discrepancia'],
        properties: {
          symbol: { type: 'string', description: 'Seis letras, p. ej. EURJPY' },
          sesgo: { type: 'integer', enum: [-2, -1, 0, 1, 2], description: '+2 base muy fuerte … −2 cotizada muy fuerte' },
          confianza: { type: 'integer', description: '0–100, calibrada: 70 = acierto 7 de 10' },
          horizonte_dias: { type: 'integer', enum: [1, 5, 20] },
          motivos: { type: 'array', items: { type: 'string' }, description: '1 a 3 motivos con número (máx. 200 caracteres cada uno)' },
          invalidacion: { type: 'string', description: 'Nivel o evento que anularía el sesgo (máx. 200)' },
          evento_clave: { type: 'string', description: 'Próximo evento que puede cambiarlo (máx. 120); vacío si ninguno' },
          coincide_radar: { type: 'boolean' },
          discrepancia: { type: 'string', description: 'Si no coincide con el radar, qué ve uno que no ve el otro (máx. 300); vacío si coincide' },
        },
      },
    },
    eventos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'divisa', 'tono', 'cambia_expectativas', 'confirmacion', 'lectura'],
        properties: {
          titulo: { type: 'string' },
          divisa: { type: 'string' },
          tono: { type: 'integer', enum: [-2, -1, 0, 1, 2], description: 'hawkish +2 … dovish −2 frente a lo descontado' },
          cambia_expectativas: { type: 'boolean' },
          confirmacion: {
            type: 'object',
            additionalProperties: false,
            required: ['bono_2a', 'dxy', 'oro_nasdaq'],
            properties: { bono_2a: { type: 'string' }, dxy: { type: 'string' }, oro_nasdaq: { type: 'string' } },
          },
          lectura: { type: 'string', description: 'Máx. 600 caracteres' },
        },
      },
    },
    nota_jefe: { type: 'string', description: 'Solo el jefe de mesa (máx. 800); los analistas la dejan vacía' },
  },
};

const isInt = (v) => Number.isInteger(v);
const str = (v, max) => typeof v === 'string' && v.length <= max;

/**
 * Comprueba una ficha contra el contrato original. `universo` limita los símbolos admitidos.
 * @returns {string[]} errores (vacío si es válida)
 */
export function validarFicha(f, { universo = null, agente = null, fecha = null } = {}) {
  const errs = [];
  if (!f || typeof f !== 'object') return ['La salida no es un objeto JSON.'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.fecha))) errs.push('fecha debe ser AAAA-MM-DD.');
  else if (fecha && f.fecha !== fecha) errs.push(`fecha debe ser ${fecha} (la del paquete).`);
  if (!AGENTES.includes(f.agente)) errs.push('agente no reconocido.');
  else if (agente && f.agente !== agente) errs.push(`agente debe ser ${agente}.`);
  if (typeof f.version_fichas !== 'string') errs.push('version_fichas debe ser texto.');
  if (!Array.isArray(f.pares)) errs.push('pares debe ser una lista.');
  else {
    const seen = new Set();
    f.pares.forEach((p, i) => {
      const at = `pares[${i}]`;
      if (!p || typeof p !== 'object') return errs.push(`${at} no es un objeto.`);
      if (!/^[A-Z]{6}$/.test(String(p.symbol))) errs.push(`${at}.symbol debe tener seis letras mayúsculas.`);
      else if (universo && !universo.includes(p.symbol)) errs.push(`${at}.symbol ${p.symbol} no está en el universo (${universo.join(', ')}).`);
      else if (seen.has(p.symbol)) errs.push(`${at}.symbol ${p.symbol} repetido.`);
      seen.add(p.symbol);
      if (!isInt(p.sesgo) || p.sesgo < -2 || p.sesgo > 2) errs.push(`${at}.sesgo debe ser un entero entre −2 y +2.`);
      if (!isInt(p.confianza) || p.confianza < 0 || p.confianza > 100) errs.push(`${at}.confianza debe ser un entero entre 0 y 100.`);
      if (p.horizonte_dias !== undefined && ![1, 5, 20].includes(p.horizonte_dias)) errs.push(`${at}.horizonte_dias debe ser 1, 5 o 20.`);
      if (!Array.isArray(p.motivos) || p.motivos.length < 1 || p.motivos.length > 3) errs.push(`${at}.motivos debe tener entre 1 y 3 textos.`);
      else p.motivos.forEach((m, j) => { if (!str(m, 200)) errs.push(`${at}.motivos[${j}] debe ser texto de 200 caracteres como máximo.`); });
      if (!str(p.invalidacion, 200)) errs.push(`${at}.invalidacion debe ser texto de 200 caracteres como máximo.`);
      if (p.evento_clave !== undefined && !str(p.evento_clave, 120)) errs.push(`${at}.evento_clave debe ser texto de 120 caracteres como máximo.`);
      if (typeof p.coincide_radar !== 'boolean') errs.push(`${at}.coincide_radar debe ser true o false.`);
      if (p.discrepancia !== undefined && !str(p.discrepancia, 300)) errs.push(`${at}.discrepancia debe ser texto de 300 caracteres como máximo.`);
    });
  }
  if (!Array.isArray(f.eventos)) errs.push('eventos debe ser una lista.');
  else {
    f.eventos.forEach((e, i) => {
      const at = `eventos[${i}]`;
      if (!e || typeof e !== 'object') return errs.push(`${at} no es un objeto.`);
      if (typeof e.titulo !== 'string' || !e.titulo) errs.push(`${at}.titulo obligatorio.`);
      if (typeof e.divisa !== 'string' || !e.divisa) errs.push(`${at}.divisa obligatoria.`);
      if (!isInt(e.tono) || e.tono < -2 || e.tono > 2) errs.push(`${at}.tono debe ser un entero entre −2 y +2.`);
      if (typeof e.cambia_expectativas !== 'boolean') errs.push(`${at}.cambia_expectativas debe ser true o false.`);
      if (!str(e.lectura, 600)) errs.push(`${at}.lectura debe ser texto de 600 caracteres como máximo.`);
    });
  }
  if (f.nota_jefe !== undefined && !str(f.nota_jefe, 800)) errs.push('nota_jefe debe ser texto de 800 caracteres como máximo.');
  return errs;
}
