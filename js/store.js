// Persistencia local: todo queda en el teléfono (localStorage). No hay servidor.

import { asRate } from './calc.js';

const KEY = 'prestamos.v1';
const PREF_PREFIX = 'prestamos.pref.';

export const emptyDb = () => ({ version: 1, people: [], loans: [] });

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Valida y normaliza datos (de localStorage o de un backup importado). Lanza un Error si no sirven. */
export function normalize(raw) {
  if (!raw || !Array.isArray(raw.people) || !Array.isArray(raw.loans)) {
    throw new Error('El archivo no tiene el formato de un backup de Préstamos.');
  }
  const people = raw.people
    .filter((p) => p && p.id && typeof p.name === 'string')
    .map((p) => ({ id: String(p.id), name: p.name.trim(), phone: p.phone || '', notes: p.notes || '' }));
  const ids = new Set(people.map((p) => p.id));

  const loans = raw.loans.map((l, i) => {
    if (!l || !l.id || !ids.has(l.personId) || !isIso(l.startDate) || !isIso(l.dueDate)) {
      throw new Error(`El préstamo número ${i + 1} del archivo está incompleto o es inválido.`);
    }
    return {
      id: String(l.id),
      personId: String(l.personId),
      direction: l.direction === 'borrowed' ? 'borrowed' : 'lent',
      currency: l.currency === 'USD' ? 'USD' : 'ARS',
      capital: num(l.capital),
      startDate: l.startDate,
      dueDate: l.dueDate,
      mode: l.mode === 'daily' ? 'daily' : 'percent',
      percent: num(l.percent),
      dailyAmount: num(l.dailyAmount),
      // Formato viejo: `lateFeePerDay` (monto fijo diario) y cambios con `amount`. Se migran a tarifas.
      lateFee: asRate(l.lateFee ?? l.lateFeePerDay),
      lateFeeFrom: isIso(l.lateFeeFrom) ? l.lateFeeFrom : null,
      lateFeeChanges: (Array.isArray(l.lateFeeChanges) ? l.lateFeeChanges : [])
        .filter((ch) => ch && isIso(ch.from))
        .map((ch) => ({ id: String(ch.id || uid()), from: ch.from, rate: asRate(ch.rate ?? ch.amount) }))
        .filter((ch) => ch.rate.value >= 0),
      forgivenAt: isIso(l.forgivenAt) ? l.forgivenAt : null,
      notes: l.notes || '',
      createdAt: l.createdAt || new Date().toISOString(),
      payments: (Array.isArray(l.payments) ? l.payments : [])
        .filter((p) => p && isIso(p.date) && num(p.amount) > 0)
        .map((p) => ({ id: String(p.id || uid()), date: p.date, amount: num(p.amount), note: p.note || '' })),
    };
  });

  return { version: 1, people, loans };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : emptyDb();
  } catch {
    return emptyDb();
  }
}

export function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

export function getPref(name, fallback) {
  try {
    const v = localStorage.getItem(PREF_PREFIX + name);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function setPref(name, value) {
  try {
    localStorage.setItem(PREF_PREFIX + name, value);
  } catch {
    /* sin almacenamiento: la preferencia solo dura esta sesión */
  }
}

/** Pide al navegador que no borre los datos por falta de espacio (si lo soporta). */
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {});
}
