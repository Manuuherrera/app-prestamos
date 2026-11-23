// Lógica pura de préstamos: sin DOM ni almacenamiento, para poder testearla con `node --test`.
// Las fechas se manejan como strings ISO 'YYYY-MM-DD' y se convierten a "número de día" UTC,
// así los cálculos no se ven afectados por husos horarios ni cambios de horario.

const DAY_MS = 86400000;
const EPS = 0.004;

const pad = (n) => String(n).padStart(2, '0');

export function dayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso, n) {
  return fromDayNumber(dayNumber(iso) + n);
}

export function diffDays(fromIso, toIso) {
  return dayNumber(toIso) - dayNumber(fromIso);
}

export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

/**
 * Condiciones acordadas del préstamo (sin mora ni pagos).
 * - percent: total = capital × (1 + % / 100), a devolver en la fecha acordada.
 * - daily:   una cuota fija por día, desde el día siguiente al inicio hasta la fecha acordada.
 */
export function loanTerms(loan) {
  const days = Math.max(0, diffDays(loan.startDate, loan.dueDate));
  if (loan.mode === 'daily') {
    const total = round2((loan.dailyAmount || 0) * days);
    return { days, installments: days, total, interest: round2(total - loan.capital) };
  }
  const total = round2(loan.capital * (1 + (loan.percent || 0) / 100));
  return { days, installments: 0, total, interest: round2(total - loan.capital) };
}

/** Primer día en que corre la mora: el día siguiente al vencimiento, o "cobrar mora desde" si es posterior. */
export function lateFeeStart(loan) {
  const dayAfterDue = addDays(loan.dueDate, 1);
  return loan.lateFeeFrom && loan.lateFeeFrom > dayAfterDue ? loan.lateFeeFrom : dayAfterDue;
}

/**
 * Estado del préstamo a una fecha dada.
 *
 * Mora: por cada día D desde `lateFeeStart` hasta la fecha de corte, si al empezar ese día
 * queda saldo (total + mora acumulada − pagos hechos antes de D), se suma `lateFeePerDay`.
 * O sea, el saldo de "hoy" ya incluye la mora de hoy, y si se paga ese saldo hoy, deja de correr.
 * Si el préstamo se condonó, la mora se congela en la fecha de condonación.
 */
export function computeLoan(loan, asOf = todayISO()) {
  const terms = loanTerms(loan);
  const payments = (loan.payments || [])
    .filter((p) => p.date <= asOf)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));

  const forgiven = Boolean(loan.forgivenAt);
  const moraUntil = forgiven && loan.forgivenAt < asOf ? loan.forgivenAt : asOf;
  const fee = loan.lateFeePerDay || 0;
  const moraFrom = lateFeeStart(loan);

  let mora = 0;
  let moraDays = 0;
  if (fee > 0 && moraFrom <= moraUntil) {
    let i = 0;
    let paidBefore = 0;
    const end = dayNumber(moraUntil);
    for (let d = dayNumber(moraFrom); d <= end; d++) {
      while (i < payments.length && dayNumber(payments[i].date) < d) {
        paidBefore += payments[i].amount;
        i++;
      }
      // Una vez saldado no puede volver a tener saldo (los pagos solo restan), así que cortamos.
      if (terms.total + mora - paidBefore <= EPS) break;
      mora += fee;
      moraDays++;
    }
    mora = round2(mora);
  }

  const owed = round2(terms.total + mora);
  const balance = round2(owed - paid);
  const daysToDue = diffDays(asOf, loan.dueDate);

  let expected = 0;
  let behindBy = 0;
  let installmentsBehind = 0;
  if (loan.mode === 'daily' && terms.installments > 0) {
    const elapsed = Math.min(Math.max(diffDays(loan.startDate, asOf), 0), terms.installments);
    expected = round2(loan.dailyAmount * elapsed);
    behindBy = round2(Math.max(0, Math.min(expected, terms.total) - paid));
    installmentsBehind = loan.dailyAmount > 0 ? Math.floor(behindBy / loan.dailyAmount + EPS) : 0;
  }

  let status;
  if (forgiven) status = 'forgiven';
  else if (balance <= EPS) status = 'paid';
  else if (daysToDue < 0) status = 'overdue';
  else if (behindBy > EPS) status = 'behind';
  else if (daysToDue <= 3) status = 'dueSoon';
  else status = 'current';

  const lastPayment = payments.length ? payments[payments.length - 1].date : null;

  return {
    ...terms,
    paid,
    mora,
    moraDays,
    moraFrom,
    owed,
    balance,
    status,
    daysToDue,
    daysOverdue: status === 'overdue' ? -daysToDue : 0,
    expected,
    behindBy,
    installmentsBehind,
    lastPayment,
    progress: owed > 0 ? Math.min(1, paid / owed) : 1,
  };
}

export const OPEN_STATUSES = ['overdue', 'behind', 'dueSoon', 'current'];
export const isOpen = (status) => OPEN_STATUSES.includes(status);

const STATUS_RANK = { overdue: 0, behind: 1, dueSoon: 2, current: 3, paid: 4, forgiven: 5 };

/** Orden de las listas: primero lo urgente, después lo que vence antes y al final lo cerrado. */
export function compareLoans(a, b) {
  const ra = STATUS_RANK[a.c.status];
  const rb = STATUS_RANK[b.c.status];
  if (ra !== rb) return ra - rb;
  if (a.c.status === 'overdue') return b.c.daysOverdue - a.c.daysOverdue;
  if (!isOpen(a.c.status)) {
    const da = a.c.lastPayment || a.loan.dueDate;
    const db = b.c.lastPayment || b.loan.dueDate;
    return da < db ? 1 : da > db ? -1 : 0;
  }
  return a.loan.dueDate < b.loan.dueDate ? -1 : a.loan.dueDate > b.loan.dueDate ? 1 : 0;
}

/** Totales de saldo pendiente por moneda. `items` son pares { loan, c }. */
export function totalsByCurrency(items) {
  const out = {};
  for (const { loan, c } of items) {
    if (!isOpen(c.status)) continue;
    const t = (out[loan.currency] ||= { balance: 0, mora: 0, count: 0, overdue: 0 });
    t.balance = round2(t.balance + c.balance);
    t.mora = round2(t.mora + c.mora);
    t.count++;
    if (c.status === 'overdue') t.overdue++;
  }
  return out;
}
