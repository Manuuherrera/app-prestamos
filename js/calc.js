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
 * - daily:   interés fijo por día (desde el día siguiente al inicio hasta la fecha acordada, inclusive);
 *            total = capital + interés diario × días. Se devuelve todo junto en la fecha acordada.
 */
export function loanTerms(loan) {
  const days = Math.max(0, diffDays(loan.startDate, loan.dueDate));
  const interest =
    loan.mode === 'daily' ? round2((loan.dailyAmount || 0) * days) : round2((loan.capital * (loan.percent || 0)) / 100);
  return { days, total: round2(loan.capital + interest), interest };
}

/** Primer día en que corre la mora: el día siguiente al vencimiento, o "cobrar mora desde" si es posterior. */
export function lateFeeStart(loan) {
  const dayAfterDue = addDays(loan.dueDate, 1);
  return loan.lateFeeFrom && loan.lateFeeFrom > dayAfterDue ? loan.lateFeeFrom : dayAfterDue;
}

/**
 * Tarifa de mora: { type: 'fixed' | 'percent', value, period: 'day' | 'week' | 'month' }.
 * - fixed:   `value` es un monto por período.
 * - percent: `value` es un % del capital por período.
 * Se cobra prorrateada por día: semana = 7 días, mes = 30 días.
 */
export const PERIOD_DAYS = { day: 1, week: 7, month: 30 };

/** Normaliza una tarifa (acepta el formato viejo: un monto fijo por día). */
export function asRate(r) {
  if (r && typeof r === 'object' && 'type' in r) {
    return { type: r.type === 'percent' ? 'percent' : 'fixed', value: Number(r.value) || 0, period: PERIOD_DAYS[r.period] ? r.period : 'day' };
  }
  return { type: 'fixed', value: Number(r) || 0, period: 'day' };
}

/** Tarifa base del préstamo (antes de cualquier cambio). */
export const baseRate = (loan) => asRate(loan.lateFee ?? loan.lateFeePerDay);

/** Mora diaria (monto) que genera una tarifa para este préstamo, redondeada a centavos. */
export function dailyFee(loan, rate) {
  const r = asRate(rate);
  const perPeriod = r.type === 'percent' ? (loan.capital * r.value) / 100 : r.value;
  return round2(perPeriod / PERIOD_DAYS[r.period]);
}

/** Cambios de mora ordenados por fecha. Cada uno rige desde `from` (inclusive) hasta el siguiente. */
export function feeChanges(loan) {
  return (loan.lateFeeChanges || [])
    .map((ch) => ({ ...ch, rate: asRate(ch.rate ?? ch.amount) }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/** Tarifa vigente en un día: la del último cambio con `from` <= día, o la base del préstamo. */
export function rateOn(loan, iso, changes = feeChanges(loan)) {
  let rate = baseRate(loan);
  for (const ch of changes) {
    if (ch.from <= iso) rate = ch.rate;
    else break;
  }
  return rate;
}

/** Mora diaria (monto) vigente en un día. */
export const feeOn = (loan, iso, changes = feeChanges(loan)) => dailyFee(loan, rateOn(loan, iso, changes));

/**
 * Estado del préstamo a una fecha dada.
 *
 * Mora: por cada día D desde `lateFeeStart` hasta la fecha de corte, si al empezar ese día
 * queda saldo (total + mora acumulada − pagos hechos antes de D), se suma la mora diaria vigente ese día.
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
  const changes = feeChanges(loan);
  const anyFee = dailyFee(loan, baseRate(loan)) > 0 || changes.some((ch) => dailyFee(loan, ch.rate) > 0);
  const moraFrom = lateFeeStart(loan);

  let mora = 0;
  let moraDays = 0;
  // Tramos de mora: días consecutivos cobrados con la misma tarifa.
  const segments = [];
  if (anyFee && moraFrom <= moraUntil) {
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
      const iso = fromDayNumber(d);
      const rate = rateOn(loan, iso, changes);
      const fee = dailyFee(loan, rate);
      if (fee <= 0) continue;
      mora += fee;
      moraDays++;
      const last = segments[segments.length - 1];
      if (last && last.fee === fee && dayNumber(last.to) === d - 1) {
        last.to = iso;
        last.days++;
        last.subtotal = round2(last.subtotal + fee);
      } else {
        segments.push({ from: iso, to: iso, days: 1, fee, rate, subtotal: fee });
      }
    }
    mora = round2(mora);
  }

  const owed = round2(terms.total + mora);
  const balance = round2(owed - paid);
  const daysToDue = diffDays(asOf, loan.dueDate);

  let status;
  if (forgiven) status = 'forgiven';
  else if (balance <= EPS) status = 'paid';
  else if (daysToDue < 0) status = 'overdue';
  else if (daysToDue <= 3) status = 'dueSoon';
  else status = 'current';

  const lastPayment = payments.length ? payments[payments.length - 1].date : null;
  const split = partnerSplit(loan, terms, mora);

  return {
    ...terms,
    ...split,
    myProfit: round2(owed - loan.capital - split.partnerTotal),
    paid,
    mora,
    moraDays,
    moraFrom,
    moraSegments: segments,
    currentFee: feeOn(loan, asOf, changes),
    currentRate: rateOn(loan, asOf, changes),
    owed,
    balance,
    status,
    daysToDue,
    daysOverdue: status === 'overdue' ? -daysToDue : 0,
    lastPayment,
    progress: owed > 0 ? Math.min(1, paid / owed) : 1,
  };
}

/**
 * Reparto del interés con un tercero (por ejemplo, un amigo que trajo al deudor). No toca el capital
 * ni lo que debe el deudor: solo divide la ganancia.
 * `loan.partner = { name, value, includeMora }`:
 * - modo percent: `value` son puntos de % del capital (de un 60 %, el amigo se queda con 10).
 * - modo daily:   `value` es su parte del interés por día (de $10.000/día, el amigo $4.000).
 * - includeMora:  si también le toca la mora, en la misma proporción que el interés.
 */
export function partnerSplit(loan, terms, mora) {
  const p = loan.partner;
  const none = { partnerName: '', partnerInterest: 0, partnerMora: 0, partnerTotal: 0 };
  if (!p || !(p.value > 0) || !(terms.interest > 0)) return none;
  const raw = loan.mode === 'daily' ? p.value * terms.days : (loan.capital * p.value) / 100;
  const partnerInterest = round2(Math.min(raw, terms.interest));
  const partnerMora = p.includeMora ? round2((mora * partnerInterest) / terms.interest) : 0;
  return { partnerName: p.name || 'Tercero', partnerInterest, partnerMora, partnerTotal: round2(partnerInterest + partnerMora) };
}

export const OPEN_STATUSES = ['overdue', 'dueSoon', 'current'];
export const isOpen = (status) => OPEN_STATUSES.includes(status);

const STATUS_RANK = { overdue: 0, dueSoon: 1, current: 2, paid: 3, forgiven: 4 };

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

/**
 * Reporte de rentabilidad de un conjunto de préstamos (una sola dirección y moneda).
 * Convención: los pagos cubren primero el capital y después el interés y la mora.
 * - invested:  capital prestado (histórico)
 * - inStreet:  capital todavía no recuperado de préstamos abiertos
 * - collected: total cobrado
 * - realized:  TU ganancia ya cobrada (lo cobrado por encima del capital, menos la parte de terceros)
 * - pending:   TU ganancia que falta cobrar en préstamos abiertos (interés + mora a hoy)
 * - partnerRealized / partnerPending: la parte de terceros, cobrada y por cobrar
 * - lost:      capital no recuperado de préstamos condonados
 * - forgivenProfit: interés y mora que se dejaron de cobrar por condonar
 * La parte de terceros se reparte proporcionalmente sobre cada peso de ganancia cobrado.
 */
export function profitReport(items) {
  const r = {
    count: 0, open: 0, closed: 0, invested: 0, inStreet: 0, collected: 0, realized: 0, pending: 0,
    partnerRealized: 0, partnerPending: 0, mora: 0, lost: 0, forgivenProfit: 0, balance: 0,
  };
  for (const { loan, c } of items) {
    r.count++;
    r.invested += loan.capital;
    r.collected += c.paid;
    r.mora += c.mora;
    const realized = Math.max(0, c.paid - loan.capital);
    const expectedProfit = Math.max(0, c.owed - loan.capital);
    const partnerFrac = expectedProfit > 0 ? Math.min(1, (c.partnerTotal || 0) / expectedProfit) : 0;
    r.realized += realized * (1 - partnerFrac);
    r.partnerRealized += realized * partnerFrac;
    if (isOpen(c.status)) {
      r.open++;
      r.inStreet += Math.max(0, loan.capital - c.paid);
      const pending = Math.max(0, expectedProfit - realized);
      r.pending += pending * (1 - partnerFrac);
      r.partnerPending += pending * partnerFrac;
      r.balance += Math.max(0, c.balance);
    } else {
      r.closed++;
      if (c.status === 'forgiven') {
        r.lost += Math.max(0, loan.capital - c.paid);
        r.forgivenProfit += Math.max(0, expectedProfit - realized);
      }
    }
  }
  for (const k of Object.keys(r)) if (!['count', 'open', 'closed'].includes(k)) r[k] = round2(r[k]);
  r.roi = r.invested > 0 ? r.realized / r.invested : 0;
  r.expectedRoi = r.invested > 0 ? (r.realized + r.pending) / r.invested : 0;
  return r;
}

/** Total pagado por mes ('YYYY-MM') en los últimos `months` meses hasta `asOf`, del más viejo al más nuevo. */
export function paymentsByMonth(loans, asOf, months = 6) {
  const [y, m] = asOf.split('-').map(Number);
  const keys = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  const sums = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const loan of loans) {
    for (const p of loan.payments || []) {
      if (p.date > asOf) continue;
      const k = p.date.slice(0, 7);
      if (k in sums) sums[k] = round2(sums[k] + p.amount);
    }
  }
  return keys.map((month) => ({ month, total: sums[month] }));
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
