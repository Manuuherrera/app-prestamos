// Formato y parseo para mostrar datos en español rioplatense.

const moneyFormatters = new Map();

export function money(value, currency = 'ARS') {
  let v = Math.round((value + Number.EPSILON) * 100) / 100;
  if (Math.abs(v) < 0.005) v = 0;
  const whole = Number.isInteger(v);
  const key = `${currency}-${whole}`;
  if (!moneyFormatters.has(key)) {
    moneyFormatters.set(
      key,
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency,
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: 2,
      }),
    );
  }
  return moneyFormatters.get(key).format(v);
}

const toDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const longFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortYearFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const numericFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

export const dateLong = (iso) => longFmt.format(toDate(iso));
export const dateNumeric = (iso) => numericFmt.format(toDate(iso));
export function dateShort(iso, referenceIso) {
  const sameYear = referenceIso && iso.slice(0, 4) === referenceIso.slice(0, 4);
  return (sameYear ? shortFmt : shortYearFmt).format(toDate(iso)).replace('.', '');
}

/**
 * Convierte lo que se escribe en un campo de monto a número.
 * Acepta "120000", "120.000", "120.000,50", "1500,5", "$ 2.000", "1500.75".
 * Devuelve NaN si no es un número válido.
 */
export function parseAmount(input) {
  if (typeof input === 'number') return input;
  let s = String(input ?? '').replace(/[\s$]|US/g, '');
  if (!s) return NaN;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = (s.match(/\./g) || []).length;
    // Un solo punto con exactamente 3 dígitos detrás ("1.500") es separador de miles en Argentina.
    if (dots > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100) / 100;
}

/** Muestra un número en un input de forma editable: 120000.5 → "120000,5". */
export const amountForInput = (n) => (n || n === 0 ? String(n).replace('.', ',') : '');

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
