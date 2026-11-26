import {
  computeLoan,
  loanTerms,
  todayISO,
  diffDays,
  addDays,
  compareLoans,
  totalsByCurrency,
  isOpen,
  round2,
  feeChanges,
  asRate,
  baseRate,
  dailyFee,
  sortedInstallments,
  scheduleDates,
  addMonths,
  profitReport,
  paymentsByMonth,
} from './calc.js';
import * as store from './store.js';
import { money, dateLong, dateShort, dateNumeric, parseAmount, amountForInput, plural, esc } from './format.js';

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

// Subir junto con CACHE en sw.js en cada publicación.
const APP_VERSION = '1.6.0';

let db = store.load();
const ui = {
  dir: store.getPref('dir', 'lent'),
  filter: 'active',
  reportCur: 'ARS',
};

const $app = document.getElementById('app');
const $tabbar = document.getElementById('tabbar');
const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');

const CURRENCIES = ['ARS', 'USD'];

const STATUS = {
  overdue: { label: 'Vencido', tone: 'red' },
  dueSoon: { label: 'Vence pronto', tone: 'yellow' },
  current: { label: 'Al día', tone: 'blue' },
  paid: { label: 'Pagado', tone: 'green' },
  forgiven: { label: 'Condonado', tone: 'gray' },
};

const DIR = {
  lent: { tab: 'Me deben', total: 'Te deben', one: 'Te debe', verb: 'Presté' },
  borrowed: { tab: 'Debo', total: 'Debés', one: 'Le debés', verb: 'Me prestaron' },
};

const personById = (id) => db.people.find((p) => p.id === id);
const loanById = (id) => db.loans.find((l) => l.id === id);
const withCalc = (loan, asOf = todayISO()) => ({ loan, c: computeLoan(loan, asOf), person: personById(loan.personId) });

function persist() {
  if (!store.save(db)) toast('No se pudo guardar. Revisá el espacio libre del teléfono.', 'error');
}

// ---------------------------------------------------------------------------
// Íconos (SVG en línea, trazo de 2px)
// ---------------------------------------------------------------------------

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 4.5 7.5 12l7.5 7.5"/>',
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r=".6"/><circle cx="4.5" cy="12" r=".6"/><circle cx="4.5" cy="17.5" r=".6"/>',
  people:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  share: '<path d="M12 3.5v11M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  chat: '<path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5Z"/>',
  phone:
    '<path d="M6.6 3.5h2.6l1.4 4-2 1.3a11 11 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 20h14"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  hand: '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3.8 14a1.5 1.5 0 0 1 2.4-1.8L7 13.5"/>',
};

const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// ---------------------------------------------------------------------------
// Router (hash): #/ · #/prestamo/:id · #/prestamo/nuevo · #/personas · #/persona/:id · #/ajustes
// ---------------------------------------------------------------------------

function parseHash() {
  const [path, query = ''] = (location.hash.slice(1) || '/').split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

function resolve() {
  const { parts, params } = parseHash();
  const [a, b, c] = parts;
  if (!a) return listView();
  if (a === 'prestamo' && b === 'nuevo') return loanFormView(null, params.get('persona'));
  if (a === 'prestamo' && b && c === 'editar') return loanById(b) ? loanFormView(loanById(b)) : notFoundView();
  if (a === 'prestamo' && b) return loanDetailView(loanById(b));
  if (a === 'personas') return peopleView();
  if (a === 'persona' && b === 'nueva') return personFormView(null);
  if (a === 'persona' && b && c === 'editar') return personById(b) ? personFormView(personById(b)) : notFoundView();
  if (a === 'persona' && b) return personDetailView(personById(b));
  if (a === 'ajustes') return settingsView();
  if (a === 'reportes') return reportsView();
  return notFoundView();
}

function render({ keepScroll = false } = {}) {
  const view = resolve();
  const y = window.scrollY;
  $app.innerHTML = shell(view);
  document.title = view.title ? `${view.title} · Préstamos` : 'Préstamos';
  $tabbar.querySelectorAll('[data-tab]').forEach((el) => {
    if (el.dataset.tab === view.tab) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  $tabbar.hidden = !view.tab;
  document.body.classList.toggle('has-tabbar', Boolean(view.tab));
  window.scrollTo(0, keepScroll ? y : 0);
  view.mounted?.();
}

const go = (hash) => location.replace(hash);

function shell({ title, back, right = '', large = false, body }) {
  return `
    <header class="nav ${large ? 'nav--large' : ''}">
      <div class="nav-bar">
        <div class="nav-side">${back ? `<a class="nav-back tappable" href="${back.href}">${icon('back')}<span>${esc(back.label)}</span></a>` : ''}</div>
        <div class="nav-title">${large ? '' : esc(title)}</div>
        <div class="nav-side nav-side--end">${right}</div>
      </div>
    </header>
    <main class="content">
      ${large ? `<h1 class="large-title">${esc(title)}</h1>` : ''}
      ${body}
    </main>`;
}

// ---------------------------------------------------------------------------
// Piezas reutilizables
// ---------------------------------------------------------------------------

const pill = (status) => `<span class="pill pill--${STATUS[status].tone}">${STATUS[status].label}</span>`;

// --- Tarifas de mora (monto fijo o % del capital, por día/semana/mes) ---

const PERIOD = {
  day: { adj: 'diario', per: 'por día', tab: 'Día' },
  week: { adj: 'semanal', per: 'por semana', tab: 'Semana' },
  month: { adj: 'mensual', per: 'por mes', tab: 'Mes' },
};

/** "$ 2.000 por día" · "5 % semanal del capital" · "Sin mora" */
function rateLabel(rate, cur, mode) {
  const r = asRate(rate);
  if (!r.value) return 'Sin mora';
  const perCuota = mode === 'installments';
  return r.type === 'percent'
    ? `${amountForInput(r.value)} % ${PERIOD[r.period].adj} ${perCuota ? 'de cada cuota atrasada' : 'del capital'}`
    : `${money(r.value, cur)} ${PERIOD[r.period].per}${perCuota ? ' por cada cuota atrasada' : ''}`;
}

/** Campos para cargar una tarifa (tipo, valor y período). */
function rateFields(rate, cur, { autofocus = false } = {}) {
  const r = asRate(rate);
  return `
    <div class="field">
      ${segmented('feeType', [['fixed', 'Monto fijo'], ['percent', 'Porcentaje']], r.type, { form: true })}
    </div>
    <label class="field">
      <span class="field-label" data-when="feeType:fixed;mode:percent|daily">Monto de la mora (${cur === 'USD' ? 'US$' : '$'})</span>
      <span class="field-label" data-when="feeType:fixed;mode:installments">Monto por cada cuota atrasada (${cur === 'USD' ? 'US$' : '$'})</span>
      <span class="field-label" data-when="feeType:percent;mode:percent|daily">Porcentaje del capital</span>
      <span class="field-label" data-when="feeType:percent;mode:installments">Porcentaje de cada cuota atrasada</span>
      <span class="input-affix">
        <input name="feeValue" type="text" inputmode="decimal" placeholder="0 = sin mora" value="${r.value ? amountForInput(r.value) : ''}" ${autofocus ? 'autofocus' : ''} enterkeyhint="done">
        <span data-when="feeType:percent">%</span>
      </span>
    </label>
    <div class="field field--inline">
      <span class="field-label">Cada</span>
      ${segmented('feePeriod', Object.entries(PERIOD).map(([k, v]) => [k, v.tab]), r.period, { form: true })}
    </div>
    <output class="preview preview--fee" aria-live="polite" hidden></output>`;
}

function readRate(f) {
  const raw = String(f.get('feeValue') || '').trim();
  return { type: f.get('feeType') === 'percent' ? 'percent' : 'fixed', value: raw ? parseAmount(raw) : 0, period: f.get('feePeriod') || 'day' };
}

/**
 * Muestra cuánto suma por día una tarifa que no es un monto fijo diario.
 * `base` es el capital, o el monto de una cuota si `perCuota`.
 */
function updateRatePreview(form, base, cur, perCuota = false) {
  const out = form.querySelector('.preview--fee');
  if (!out) return;
  const rate = readRate(new FormData(form));
  let html = '';
  if (!Number.isNaN(rate.value) && rate.value > 0 && !(rate.type === 'fixed' && rate.period === 'day')) {
    if (rate.type === 'percent' && !(base > 0)) html = `<span>Cargá ${perCuota ? 'el monto de la cuota' : 'el capital'} para ver cuánto suma por día.</span>`;
    else {
      const daily = dailyFee({ capital: base }, rate);
      html = `<strong>Suma ${money(daily, cur)} por día de atraso${perCuota ? ` por cada cuota${rate.type === 'percent' ? ` de ${money(base, cur)}` : ''}` : ''}</strong>${rate.period !== 'day' ? `<span>Se cobra proporcional: ${rate.period === 'week' ? 'semana = 7 días' : 'mes = 30 días'}.</span>` : ''}`;
    }
  }
  out.innerHTML = html;
  out.hidden = !html;
}

/** "13 días × $ 2.000", o "13 días" si hubo más de una tarifa. */
const moraDetail = (c, m) =>
  c.moraSegments.length === 1 ? `${plural(c.moraDays, 'día', 'días')} × ${m(c.moraSegments[0].fee)}` : plural(c.moraDays, 'día', 'días');

function dueText(loan, c, asOf) {
  if (c.status === 'paid') return c.lastPayment ? `Pagado el ${dateShort(c.lastPayment, asOf)}` : 'Pagado';
  if (c.status === 'forgiven') return `Condonado el ${dateShort(loan.forgivenAt, asOf)}`;
  if (loan.mode === 'installments' && c.nextInstallment) {
    const q = c.nextInstallment;
    const of = `${q.n}/${c.installments.length}`;
    if (c.status === 'overdue') return c.lateCount > 1 ? `${c.lateCount} cuotas atrasadas` : `Cuota ${of} atrasada ${plural(q.daysLate || c.daysOverdue, 'día', 'días')}`;
    if (q.state === 'grace') return `Cuota ${of}: en gracia hasta el ${dateShort(q.graceUntil, asOf)}`;
    if (c.daysToDue === 0) return `Cuota ${of} vence hoy`;
    if (c.daysToDue === 1) return `Cuota ${of} vence mañana`;
    return `Cuota ${of} vence el ${dateShort(q.date, asOf)}`;
  }
  if (c.status === 'overdue') return `Venció hace ${plural(c.daysOverdue, 'día', 'días')}`;
  if (c.daysToDue === 0) return 'Vence hoy';
  if (c.daysToDue === 1) return 'Vence mañana';
  return `Vence el ${dateShort(loan.dueDate, asOf)}`;
}

function loanRow({ loan, c, person }, { showPerson = true, showCapital = false, asOf = todayISO() } = {}) {
  const title = showPerson ? esc(person?.name || 'Sin nombre') : `${DIR[loan.direction].verb} ${money(loan.capital, loan.currency)}`;
  const closed = !isOpen(c.status);
  return `
    <a class="row tappable" href="#/prestamo/${loan.id}">
      <span class="dot dot--${STATUS[c.status].tone}" aria-hidden="true"></span>
      <span class="row-main">
        <span class="row-title">${title}</span>
        <span class="row-sub">${dueText(loan, c, asOf)}${showCapital ? ` · de ${money(loan.capital, loan.currency)}` : ''}</span>
      </span>
      <span class="row-end">
        <span class="row-amount ${closed ? 'is-muted' : ''} ${c.status === 'overdue' ? 'is-red' : ''}">${money(closed ? c.paid : c.balance, loan.currency)}</span>
        ${icon('chevron', 'row-chevron')}
      </span>
    </a>`;
}

const group = (inner, { title = '', footer = '', cls = '' } = {}) => `
  <section class="group ${cls}">
    ${title ? `<h2 class="group-title">${title}</h2>` : ''}
    <div class="group-body">${inner}</div>
    ${footer ? `<p class="group-footer">${footer}</p>` : ''}
  </section>`;

const kv = (label, value, cls = '') => `
  <div class="row row--static row--kv ${cls}">
    <span class="row-main"><span class="row-label">${label}</span></span>
    <span class="row-end"><span class="row-value">${value}</span></span>
  </div>`;

const emptyState = (title, text, action = '') => `
  <div class="empty">
    <p class="empty-title">${title}</p>
    <p class="empty-text">${text}</p>
    ${action}
  </div>`;

function segmented(name, options, value, { action = '', form = false } = {}) {
  if (form) {
    return `<div class="segmented" role="radiogroup">${options
      .map(
        ([v, label]) =>
          `<label class="segment"><input type="radio" name="${name}" value="${v}" ${v === value ? 'checked' : ''}><span>${label}</span></label>`,
      )
      .join('')}</div>`;
  }
  return `<div class="segmented" role="tablist">${options
    .map(
      ([v, label]) =>
        `<button type="button" class="segment" role="tab" aria-selected="${v === value}" data-action="${action}" data-value="${v}"><span>${label}</span></button>`,
    )
    .join('')}</div>`;
}

function netByPerson(personId, asOf) {
  const items = db.loans.filter((l) => l.personId === personId).map((l) => withCalc(l, asOf));
  return { items, lent: totalsByCurrency(items.filter((i) => i.loan.direction === 'lent')), borrowed: totalsByCurrency(items.filter((i) => i.loan.direction === 'borrowed')) };
}

function netText({ lent, borrowed }) {
  const parts = [];
  for (const cur of CURRENCIES) {
    if (lent[cur]?.balance) parts.push(`te debe ${money(lent[cur].balance, cur)}`);
    if (borrowed[cur]?.balance) parts.push(`le debés ${money(borrowed[cur].balance, cur)}`);
  }
  if (!parts.length) return 'Sin saldos pendientes';
  const s = parts.join(' · ');
  return s[0].toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Vista: lista de préstamos
// ---------------------------------------------------------------------------

const FILTERS = [
  ['active', 'Activos'],
  ['overdue', 'Vencidos'],
  ['closed', 'Cerrados'],
  ['all', 'Todos'],
];

function listView() {
  const asOf = todayISO();
  const all = db.loans.filter((l) => l.direction === ui.dir).map((l) => withCalc(l, asOf));
  const totals = totalsByCurrency(all);
  const curs = CURRENCIES.filter((c) => totals[c]);

  const shown = all
    .filter(({ c }) => {
      if (ui.filter === 'active') return isOpen(c.status);
      if (ui.filter === 'overdue') return c.status === 'overdue';
      if (ui.filter === 'closed') return !isOpen(c.status);
      return true;
    })
    .sort(compareLoans);

  const overdue = curs.reduce((n, c) => n + totals[c].overdue, 0);
  const count = curs.reduce((n, c) => n + totals[c].count, 0);
  const mora = curs.filter((c) => totals[c].mora > 0).map((c) => money(totals[c].mora, c));

  const summary = `
    <section class="summary">
      <p class="summary-label">${DIR[ui.dir].total}</p>
      ${
        curs.length
          ? curs.map((c) => `<p class="summary-amount">${money(totals[c].balance, c)}</p>`).join('')
          : `<p class="summary-amount is-muted">${money(0)}</p>`
      }
      <p class="summary-meta">
        ${count ? plural(count, 'préstamo activo', 'préstamos activos') : 'Nada pendiente'}
        ${overdue ? ` · <span class="is-red">${plural(overdue, 'vencido', 'vencidos')}</span>` : ''}
        ${mora.length ? ` · incluye ${mora.join(' + ')} de mora` : ''}
      </p>
    </section>`;

  const reminder = backupReminder();

  const chips = all.length
    ? `<div class="chips" role="tablist">${FILTERS.map(
        ([v, label]) =>
          `<button type="button" class="chip" role="tab" aria-selected="${ui.filter === v}" data-action="set-filter" data-value="${v}">${label}</button>`,
      ).join('')}</div>`
    : '';

  let list;
  if (!all.length) {
    list = emptyState(
      ui.dir === 'lent' ? 'Todavía no cargaste préstamos' : 'No tenés deudas cargadas',
      ui.dir === 'lent'
        ? 'Cargá lo que prestaste, incluso préstamos viejos que siguen pendientes.'
        : 'Cargá lo que te prestaron para saber cuánto debés y cuándo vence.',
      `<a class="button button--primary tappable" href="#/prestamo/nuevo">${icon('plus')}Cargar préstamo</a>`,
    );
  } else if (!shown.length) {
    list = emptyState('No hay préstamos en esta vista', 'Probá con otro filtro.');
  } else {
    // Si una persona aparece más de una vez, mostrar el capital para distinguir sus préstamos.
    const perPerson = {};
    for (const i of shown) perPerson[i.loan.personId] = (perPerson[i.loan.personId] || 0) + 1;
    list = group(shown.map((i) => loanRow(i, { asOf, showCapital: perPerson[i.loan.personId] > 1 })).join(''));
  }

  return {
    title: 'Préstamos',
    tab: 'loans',
    large: true,
    right: `<a class="nav-action tappable" href="#/prestamo/nuevo" aria-label="Nuevo préstamo">${icon('plus')}</a>`,
    body: `
      ${segmented('dir', Object.entries(DIR).map(([k, v]) => [k, v.tab]), ui.dir, { action: 'set-dir' })}
      ${summary}
      ${reminder}
      ${chips}
      ${list}`,
  };
}

function backupReminder() {
  if (!db.loans.length) return '';
  const last = store.getPref('lastBackup', '');
  const days = last ? diffDays(last, todayISO()) : Infinity;
  if (days < 14) return '';
  return `
    <a class="notice tappable" href="#/ajustes">
      ${icon('download')}
      <span><strong>${last ? `Último backup hace ${plural(days, 'día', 'días')}` : 'Todavía no hiciste un backup'}</strong>
      Tus datos viven solo en este teléfono. Exportá una copia.</span>
      ${icon('chevron', 'row-chevron')}
    </a>`;
}

// ---------------------------------------------------------------------------
// Vista: detalle de préstamo
// ---------------------------------------------------------------------------

function loanDetailView(loan) {
  if (!loan) return notFoundView();
  const asOf = todayISO();
  const c = computeLoan(loan, asOf);
  const person = personById(loan.personId);
  const cur = loan.currency;
  const m = (n) => money(n, cur);
  const open = isOpen(c.status);

  let callout = '';
  const q = c.nextInstallment;
  if (loan.mode === 'installments' && (c.status === 'overdue' || c.status === 'dueSoon') && q) {
    const feeText = c.currentRate.value ? rateLabel(c.currentRate, cur, loan.mode) : '';
    if (c.status === 'overdue') {
      callout = `<div class="callout callout--red">
        <strong>${c.lateCount > 1 ? `${c.lateCount} cuotas atrasadas.` : `La cuota ${q.n} está atrasada ${plural(q.daysLate, 'día', 'días')}.`}</strong>
        ${feeText ? `Corre una mora de ${feeText}${c.currentFee ? ` (hoy suma ${m(c.currentFee)} por día)` : ''}.` : 'No tiene mora acordada.'}
      </div>`;
    } else if (q.state === 'grace') {
      callout = `<div class="callout callout--yellow"><strong>La cuota ${q.n} venció el ${dateShort(q.date, asOf)}.</strong> Tiene margen hasta el ${dateShort(q.graceUntil, asOf)}${feeText ? `; después corre una mora de ${feeText}` : ''}.</div>`;
    } else {
      callout = `<div class="callout callout--yellow"><strong>La cuota ${q.n} (${m(q.remaining)}) ${c.daysToDue === 0 ? 'vence hoy' : c.daysToDue === 1 ? 'vence mañana' : `vence en ${c.daysToDue} días`}.</strong>${loan.graceDays ? ` Tiene ${plural(loan.graceDays, 'día', 'días')} de margen.` : ''}</div>`;
    }
  } else if (c.status === 'overdue') {
    callout = `<div class="callout callout--red">
      <strong>Venció hace ${plural(c.daysOverdue, 'día', 'días')}.</strong>
      ${c.currentFee ? `Corre una mora de ${rateLabel(c.currentRate, cur, loan.mode)}${c.currentRate.type === 'fixed' && c.currentRate.period === 'day' ? '' : ` (${m(c.currentFee)} por día)`}${c.moraFrom > asOf ? ` desde el ${dateShort(c.moraFrom, asOf)}` : ''}.` : c.mora ? 'Ahora no corre mora.' : 'No tiene mora acordada.'}
    </div>`;
  } else if (c.status === 'dueSoon') {
    callout = `<div class="callout callout--yellow"><strong>${c.daysToDue === 0 ? 'Vence hoy.' : c.daysToDue === 1 ? 'Vence mañana.' : `Vence en ${c.daysToDue} días.`}</strong> ${c.currentFee ? `Después corre una mora de ${rateLabel(c.currentRate, cur, loan.mode)}.` : ''}</div>`;
  }

  const hero = `
    <section class="hero">
      <a class="hero-person tappable" href="#/persona/${person?.id}">${esc(person?.name || 'Sin nombre')}${icon('chevron')}</a>
      <p class="hero-label">${open ? DIR[loan.direction].one : c.status === 'paid' ? 'Saldado' : 'Condonado'}</p>
      <p class="hero-amount ${c.status === 'overdue' ? 'is-red' : ''}">${m(open ? c.balance : c.status === 'paid' ? c.paid : c.balance)}</p>
      <div class="hero-status">${pill(c.status)}</div>
      <div class="progress" role="progressbar" aria-label="Pagado" aria-valuenow="${Math.round(c.progress * 100)}" aria-valuemin="0" aria-valuemax="100">
        <span style="width:${(c.progress * 100).toFixed(1)}%"></span>
      </div>
      <p class="hero-meta">Pagado ${m(c.paid)} de ${m(c.owed)}</p>
    </section>`;

  const terms =
    loan.mode === 'installments'
      ? `${kv('Cuotas', c.installments.every((it) => it.amount === c.installments[0].amount) ? `${c.installments.length} × ${m(c.installments[0].amount)}` : plural(c.installments.length, 'cuota', 'cuotas'))}${kv('Ganancia acordada', m(c.interest))}`
      : loan.mode === 'daily'
        ? kv('Interés', `${m(loan.dailyAmount)} × ${plural(c.days, 'día', 'días')} = ${m(c.interest)}`)
        : kv('Interés', `${amountForInput(loan.percent)} % = ${m(c.interest)}`);

  const INST_STATE = {
    paid: () => 'Pagada',
    pending: (it) => (it.covered > 0 ? `Pagado ${m(it.covered)} · vence el ${dateShort(it.date, asOf)}` : `Vence el ${dateShort(it.date, asOf)}`),
    grace: (it) => `Venció el ${dateShort(it.date, asOf)} · margen hasta el ${dateShort(it.graceUntil, asOf)}`,
    late: (it) => `Atrasada ${plural(it.daysLate, 'día', 'días')}${it.covered > 0 ? ` · pagado ${m(it.covered)}` : ''}`,
  };
  const INST_TONE = { paid: 'green', pending: 'blue', grace: 'yellow', late: 'red' };
  const installmentsGroup =
    loan.mode === 'installments'
      ? group(
          c.installments
            .map(
              (it) => `
          <div class="row row--static">
            <span class="dot dot--${INST_TONE[it.state]}" aria-hidden="true"></span>
            <span class="row-main">
              <span class="row-title">Cuota ${it.n} · ${dateShort(it.date, asOf)}</span>
              <span class="row-sub ${it.state === 'late' ? 'is-red' : ''}">${INST_STATE[it.state](it)}${it.mora ? ` · mora ${m(it.mora)}` : ''}</span>
            </span>
            <span class="row-end"><span class="row-amount ${it.state === 'paid' ? 'is-muted' : ''}">${m(it.state === 'paid' ? it.amount : it.remaining)}</span></span>
          </div>`,
            )
            .join(''),
          { title: 'Cuotas', footer: `Los pagos se aplican primero a la cuota más vieja.${loan.graceDays ? ` Cada cuota tiene ${plural(loan.graceDays, 'día', 'días')} de margen antes de que corra la mora.` : ''}` },
        )
      : '';

  const summary = group(
    `
      ${kv('Capital', m(loan.capital))}
      ${terms}
      ${kv('Total acordado', m(c.total))}
      ${c.status === 'overdue' || c.mora ? kv('Mora', c.mora ? `${m(c.mora)} <small>(${loan.mode === 'installments' ? 'detalle en cuotas' : moraDetail(c, m)})</small>` : m(0)) : ''}
      ${kv('Pagado', m(c.paid))}
      ${kv(open ? 'Saldo a hoy' : 'Saldo', `<strong>${m(Math.max(0, c.balance))}</strong>`, 'row--total')}
      ${c.balance < -0.004 ? kv('Pagado de más', m(-c.balance)) : ''}
    `,
    { title: 'Resumen' },
  );

  const partnerGroup = c.partnerTotal
    ? group(
        `
        ${kv('Tu ganancia', `<strong>${m(c.myProfit)}</strong>`, 'row--total')}
        ${kv(`Parte de ${esc(c.partnerName)}`, `${m(c.partnerTotal)}${c.partnerMora ? ` <small>(${m(c.partnerInterest)} + ${m(c.partnerMora)} de mora)</small>` : ''}`)}
        ${kv('Su parte acordada', loan.mode === 'daily' ? `${m(loan.partner.value)} por día` : `${amountForInput(loan.partner.value)} % de ${amountForInput(loan.percent)} %`)}`,
        { title: 'Reparto de la ganancia', footer: loan.partner.includeMora ? 'También le toca parte de la mora, en la misma proporción que el interés.' : 'La mora es toda tuya.' },
      )
    : '';

  const segmentsGroup =
    c.moraSegments.length > 1
      ? group(
          c.moraSegments
            .map((s) =>
              kv(
                s.from === s.to ? dateShort(s.from, asOf) : `${dateShort(s.from, asOf)} – ${dateShort(s.to, asOf)}`,
                `${plural(s.days, 'día', 'días')} × ${m(s.fee)} = ${m(s.subtotal)}`,
              ),
            )
            .join(''),
          { title: 'Detalle de la mora' },
        )
      : '';

  const changes = feeChanges(loan);
  const dates = group(
    `
      ${kv('Fecha de inicio', dateLong(loan.startDate))}
      ${kv(loan.mode === 'installments' ? 'Última cuota' : 'Fecha de pago', dateLong(loan.dueDate))}
      ${loan.mode === 'installments' ? kv('Margen por cuota', loan.graceDays ? plural(loan.graceDays, 'día', 'días') : 'Sin margen') : ''}
      ${kv(changes.length ? 'Mora inicial' : 'Mora', rateLabel(baseRate(loan), cur, loan.mode))}
      ${changes
        .map(
          (ch) => `
        <button type="button" class="row tappable" data-action="fee-change-menu" data-id="${ch.id}">
          <span class="row-main"><span class="row-label">Desde el ${dateShort(ch.from, asOf)}</span></span>
          <span class="row-end"><span class="row-value">${rateLabel(ch.rate, cur, loan.mode)}</span>${icon('chevron', 'row-chevron')}</span>
        </button>`,
        )
        .join('')}
      ${loan.lateFeeFrom && loan.lateFeeFrom > addDays(loan.dueDate, 1) ? kv('Mora desde', dateLong(loan.lateFeeFrom)) : ''}
      ${kv('Moneda', cur === 'USD' ? 'Dólares' : 'Pesos')}
      ${c.status !== 'forgiven' ? `<button type="button" class="row row--action tappable" data-action="change-fee">${icon('edit')}<span>Cambiar mora</span></button>` : ''}
    `,
    { title: 'Condiciones' },
  );

  const payments = [...loan.payments].sort((a, b) => (a.date < b.date ? 1 : -1));
  const paymentsGroup = group(
    `
      ${payments
        .map(
          (p) => `
        <button type="button" class="row tappable" data-action="payment-menu" data-id="${p.id}">
          <span class="row-main">
            <span class="row-title">${m(p.amount)}</span>
            <span class="row-sub">${dateLong(p.date)}${p.date > asOf ? ' · programado' : ''}${p.note ? ` · ${esc(p.note)}` : ''}</span>
          </span>
          <span class="row-end">${icon('chevron', 'row-chevron')}</span>
        </button>`,
        )
        .join('')}
      ${
        c.status !== 'forgiven'
          ? `<button type="button" class="row row--action tappable" data-action="add-payment">${icon('plus')}<span>Registrar pago</span></button>`
          : ''
      }
    `,
    { title: `Pagos${payments.length ? ` (${payments.length})` : ''}` },
  );

  const notes = loan.notes ? group(`<p class="notes">${esc(loan.notes)}</p>`, { title: 'Notas' }) : '';

  const actions = group(
    `
      <button type="button" class="row row--action tappable" data-action="copy-loan">${icon('copy')}<span>Copiar detalle</span></button>
      <button type="button" class="row row--action tappable" data-action="share-loan">${icon('chat')}<span>Enviar resumen por WhatsApp</span></button>
      <a class="row row--action tappable" href="#/prestamo/${loan.id}/editar">${icon('edit')}<span>Editar préstamo</span></a>
      ${
        c.status === 'forgiven'
          ? `<button type="button" class="row row--action tappable" data-action="unforgive">${icon('undo')}<span>Reactivar préstamo</span></button>`
          : open
            ? `<button type="button" class="row row--action tappable" data-action="forgive">${icon('hand')}<span>Condonar el saldo</span></button>`
            : ''
      }
      <button type="button" class="row row--action row--danger tappable" data-action="delete-loan">${icon('trash')}<span>Eliminar préstamo</span></button>
    `,
  );

  return {
    title: 'Préstamo',
    back: { href: '#/', label: 'Préstamos' },
    right: `<a class="nav-text tappable" href="#/prestamo/${loan.id}/editar">Editar</a>`,
    body: `${hero}${callout}${summary}${installmentsGroup}${partnerGroup}${loan.mode === 'installments' ? '' : segmentsGroup}${paymentsGroup}${dates}${notes}${actions}`,
    loanId: loan.id,
  };
}

// ---------------------------------------------------------------------------
// Vista: formulario de préstamo
// ---------------------------------------------------------------------------

function loanFormView(loan, presetPersonId) {
  const editing = Boolean(loan);
  const today = todayISO();
  const l = loan || {
    direction: ui.dir,
    personId: presetPersonId && personById(presetPersonId) ? presetPersonId : '',
    currency: 'ARS',
    capital: '',
    startDate: today,
    dueDate: addDays(today, 30),
    mode: 'percent',
    percent: '',
    dailyAmount: '',
    lateFee: { type: 'fixed', value: 0, period: 'day' },
    lateFeeFrom: null,
    installments: [],
    graceDays: 0,
    schedule: null,
    notes: '',
  };
  const people = [...db.people].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const personValue = l.personId || (people.length ? '' : '__new');

  const body = `
    <form class="form" data-form="loan" novalidate autocomplete="off">
      ${editing ? `<input type="hidden" name="id" value="${loan.id}">` : ''}

      ${segmented('direction', [['lent', 'Presté'], ['borrowed', 'Me prestaron']], l.direction, { form: true })}

      ${group(
        `
        <label class="field">
          <span class="field-label">Persona</span>
          <select name="personId" required>
            <option value="" ${personValue === '' ? 'selected' : ''} disabled>Elegí una persona</option>
            ${people.map((p) => `<option value="${p.id}" ${p.id === personValue ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            <option value="__new" ${personValue === '__new' ? 'selected' : ''}>＋ Persona nueva</option>
          </select>
        </label>
        <div data-when="personId:__new">
          <label class="field">
            <span class="field-label">Nombre</span>
            <input name="newName" type="text" placeholder="Ej.: Juan Pérez" autocapitalize="words" enterkeyhint="next">
          </label>
          <label class="field">
            <span class="field-label">Teléfono</span>
            <input name="newPhone" type="tel" placeholder="Opcional, ej.: +54 9 11 1234-5678" enterkeyhint="next">
          </label>
        </div>`,
        { title: 'Quién' },
      )}

      ${group(
        `
        <div class="field field--inline">
          <span class="field-label">Moneda</span>
          ${segmented('currency', CURRENCIES.map((c) => [c, c === 'ARS' ? 'Pesos' : 'Dólares']), l.currency, { form: true })}
        </div>
        <label class="field">
          <span class="field-label">Capital prestado</span>
          <input name="capital" type="text" inputmode="decimal" placeholder="0" value="${amountForInput(l.capital)}" required enterkeyhint="next">
        </label>
        <label class="field">
          <span class="field-label">Fecha de inicio</span>
          <input name="startDate" type="date" value="${l.startDate}" required>
        </label>`,
        { title: 'Préstamo' },
      )}

      ${group(
        `
        <div class="field">
          ${segmented('mode', [['percent', 'Porcentaje'], ['daily', 'Interés diario'], ['installments', 'Cuotas']], l.mode, { form: true })}
        </div>
        <div data-when="mode:installments">
          <label class="field">
            <span class="field-label">Cantidad de cuotas</span>
            <input name="genCount" data-gen type="text" inputmode="numeric" placeholder="Ej.: 3" value="${l.mode === 'installments' ? l.installments.length : 3}">
          </label>
          <label class="field">
            <span class="field-label">Monto de cada cuota (capital + interés)</span>
            <input name="genAmount" data-gen type="text" inputmode="decimal" placeholder="0" value="${l.mode === 'installments' && l.installments.length ? amountForInput(l.installments[0].amount) : ''}">
          </label>
          <label class="field">
            <span class="field-label">Primera cuota</span>
            <input name="genFirst" data-gen type="date" value="${l.mode === 'installments' && l.installments.length ? sortedInstallments(l)[0].date : addMonths(l.startDate, 1)}">
          </label>
          <div class="field">
            <span class="field-label">Frecuencia</span>
            ${segmented('genFreq', [['weekly', 'Semanal'], ['biweekly', 'Quincenal'], ['monthly', 'Mensual'], ['custom', 'Otra']], l.schedule?.freq || 'monthly', { form: true })}
          </div>
          <label class="field" data-when="genFreq:custom">
            <span class="field-label">Cada cuántos días</span>
            <input name="genEvery" data-gen type="text" inputmode="numeric" placeholder="Ej.: 10" value="${l.schedule?.everyDays || 10}">
          </label>
          <div class="field">
            <span class="field-label">Cuotas (podés cambiar cualquier fecha o monto)</span>
            <div class="inst-editor" data-inst-editor>${installmentRows(l.mode === 'installments' ? sortedInstallments(l) : [])}</div>
          </div>
        </div>
        <label class="field" data-when="mode:percent">
          <span class="field-label">Interés total</span>
          <span class="input-affix"><input name="percent" type="text" inputmode="decimal" placeholder="0" value="${amountForInput(l.percent)}"><span>%</span></span>
        </label>
        <label class="field" data-when="mode:daily">
          <span class="field-label">Interés por día</span>
          <input name="dailyAmount" type="text" inputmode="decimal" placeholder="0" value="${amountForInput(l.dailyAmount)}">
        </label>
        <label class="field" data-when="mode:percent|daily">
          <span class="field-label">Fecha de pago acordada</span>
          <input name="dueDate" type="date" value="${l.dueDate}" required>
        </label>
        <output class="preview" name="preview" aria-live="polite"></output>`,
        { title: 'Cómo se devuelve' },
      )}

      ${group(
        `
        <label class="field" data-when="mode:installments">
          <span class="field-label">Días de margen por cuota</span>
          <input name="graceDays" type="text" inputmode="numeric" placeholder="0 = sin margen" value="${l.graceDays || ''}">
        </label>
        ${rateFields(editing ? baseRate(loan) : l.lateFee, l.currency)}
        <details class="field" ${l.lateFeeFrom ? 'open' : ''}>
          <summary>¿Es un préstamo viejo?</summary>
          <label class="field field--nested">
            <span class="field-label">Cobrar mora desde</span>
            <input name="lateFeeFrom" type="date" value="${l.lateFeeFrom || ''}">
          </label>
          <p class="hint">Si recién ahora empezás a cobrar la mora, poné desde qué día. Si lo dejás vacío, corre desde el día siguiente al vencimiento. Los pagos que ya te hicieron se cargan después, desde el detalle del préstamo.</p>
        </details>`,
        {
          title: 'Si no paga a tiempo',
          footer:
            editing && feeChanges(loan).length
              ? 'Este préstamo tiene cambios de mora desde ciertas fechas. Este valor solo rige antes del primer cambio. Los cambios se manejan desde el detalle, en "Cambiar mora".'
              : editing
                ? 'Cambiar este valor recalcula toda la mora, también la pasada. Para cambiarla solo desde una fecha, usá "Cambiar mora" en el detalle del préstamo.'
                : 'La mora se suma por cada día de atraso mientras quede saldo. Si es por semana o por mes, se cobra proporcional a los días.',
        },
      )}

      <div data-when="direction:lent;mode:percent|daily">
        ${group(
          `
          <details class="field" ${l.partner ? 'open' : ''}>
            <summary>¿Compartís el interés con alguien?</summary>
            <label class="field field--nested">
              <span class="field-label">Nombre</span>
              <input name="partnerName" type="text" list="people-names" placeholder="Ej.: Juan (el que lo trajo)" value="${esc(l.partner?.name || '')}" autocapitalize="words">
              <datalist id="people-names">${people.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>
            </label>
            <label class="field field--nested" data-when="mode:percent">
              <span class="field-label">Su parte del interés (puntos del %)</span>
              <span class="input-affix"><input name="partnerPct" type="text" inputmode="decimal" placeholder="Ej.: 10" value="${l.partner && l.mode === 'percent' ? amountForInput(l.partner.value) : ''}"><span>%</span></span>
            </label>
            <label class="field field--nested" data-when="mode:daily">
              <span class="field-label">Su parte por día</span>
              <input name="partnerDaily" type="text" inputmode="decimal" placeholder="Ej.: 4000" value="${l.partner && l.mode === 'daily' ? amountForInput(l.partner.value) : ''}">
            </label>
            <label class="check">
              <input name="partnerMora" type="checkbox" ${l.partner?.includeMora ? 'checked' : ''}>
              <span>También le toca parte de la mora (en la misma proporción)</span>
            </label>
            <output class="preview preview--partner" aria-live="polite" hidden></output>
          </details>`,
          { title: 'Reparto', footer: 'No cambia lo que te deben ni el capital: solo divide la ganancia. No aparece en el resumen que mandás por WhatsApp.' },
        )}
      </div>

      ${group(
        `<label class="field"><span class="field-label">Notas</span><textarea name="notes" rows="3" placeholder="Opcional: para qué fue, acuerdos, etc.">${esc(l.notes)}</textarea></label>`,
      )}

      <p class="form-error" role="alert" hidden></p>
      <button type="submit" class="button button--primary button--block tappable">${editing ? 'Guardar cambios' : 'Guardar préstamo'}</button>
    </form>`;

  return {
    title: editing ? 'Editar préstamo' : 'Nuevo préstamo',
    back: editing ? { href: `#/prestamo/${loan.id}`, label: 'Cancelar' } : { href: '#/', label: 'Cancelar' },
    body,
    mounted() {
      const form = $app.querySelector('form[data-form="loan"]');
      updateLoanForm(form);
    },
  };
}

function readLoanForm(form) {
  const f = new FormData(form);
  const n = (k) => parseAmount(f.get(k));
  return {
    direction: f.get('direction'),
    personId: f.get('personId'),
    newName: String(f.get('newName') || '').trim(),
    newPhone: String(f.get('newPhone') || '').trim(),
    currency: f.get('currency'),
    capital: n('capital'),
    startDate: f.get('startDate'),
    dueDate: f.get('dueDate'),
    mode: f.get('mode'),
    percent: f.get('percent') ? n('percent') : 0,
    dailyAmount: n('dailyAmount'),
    lateFee: readRate(f),
    lateFeeFrom: f.get('lateFeeFrom') || null,
    notes: String(f.get('notes') || '').trim(),
    partner: readPartner(f),
    installments: f.get('mode') === 'installments' ? readInstallments(f) : [],
    graceDays: f.get('graceDays') ? Number(f.get('graceDays')) : 0,
    schedule: { freq: f.get('genFreq') || 'monthly', everyDays: Math.floor(Number(f.get('genEvery'))) || 30 },
  };
}

// --- Editor de cuotas ---

/** Filas editables (fecha + monto) de cada cuota. */
function installmentRows(list) {
  if (!list.length) return '<p class="hint">Completá la cantidad, el monto y la primera fecha.</p>';
  return list
    .map(
      (q, i) => `
      <div class="inst-row">
        <span class="inst-n">${i + 1}</span>
        <input name="qDate" type="date" value="${q.date}" aria-label="Fecha de la cuota ${i + 1}">
        <input name="qAmount" type="text" inputmode="decimal" value="${amountForInput(q.amount)}" aria-label="Monto de la cuota ${i + 1}">
      </div>`,
    )
    .join('');
}

/** Arma las cuotas a partir de cantidad, monto, primera fecha y frecuencia (pisa las ediciones a mano). */
function regenerateInstallments(form) {
  const f = new FormData(form);
  const count = Math.min(120, Math.floor(Number(f.get('genCount'))));
  const amount = parseAmount(f.get('genAmount'));
  const first = f.get('genFirst');
  const editor = form.querySelector('[data-inst-editor]');
  if (!editor) return;
  if (!(count > 0) || !(amount > 0) || !first) {
    editor.innerHTML = installmentRows([]);
    return;
  }
  const dates = scheduleDates(first, count, f.get('genFreq'), Math.floor(Number(f.get('genEvery'))) || 30);
  editor.innerHTML = installmentRows(dates.map((date) => ({ date, amount })));
}

function readInstallments(f) {
  const dates = f.getAll('qDate');
  const amounts = f.getAll('qAmount');
  return dates
    .map((date, i) => ({ date, amount: parseAmount(amounts[i]) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Reparto del interés: null si no hay (campo vacío o en cero, o si el préstamo es "Me prestaron"). */
function readPartner(f) {
  if (f.get('direction') !== 'lent' || f.get('mode') === 'installments') return null;
  const raw = String(f.get(f.get('mode') === 'daily' ? 'partnerDaily' : 'partnerPct') || '').trim();
  if (!raw) return null;
  const value = parseAmount(raw);
  return { name: String(f.get('partnerName') || '').trim(), value, includeMora: f.get('partnerMora') === 'on' };
}

function validateLoan(v) {
  if (!v.personId) return 'Elegí una persona o creá una nueva.';
  if (v.personId === '__new' && !v.newName) return 'Escribí el nombre de la persona.';
  if (!(v.capital > 0)) return 'El capital tiene que ser un monto mayor a cero.';
  if (!v.startDate || !v.dueDate) return 'Completá las fechas.';
  if (v.mode === 'installments') {
    if (!v.installments.length) return 'Armá las cuotas: cantidad, monto y fecha de la primera.';
    if (v.installments.some((q) => !q.date)) return 'Todas las cuotas tienen que tener fecha.';
    if (v.installments.some((q) => !(q.amount > 0))) return 'Todas las cuotas tienen que tener un monto mayor a cero.';
    if (v.installments[0].date < v.startDate) return 'Ninguna cuota puede vencer antes de la fecha de inicio.';
    if (!Number.isInteger(v.graceDays) || v.graceDays < 0) return 'Los días de margen tienen que ser un número entero (0 o más).';
  } else if (v.mode === 'percent') {
    if (Number.isNaN(v.percent) || v.percent < 0) return 'El porcentaje no es válido.';
    if (v.dueDate < v.startDate) return 'La fecha de pago no puede ser anterior al inicio.';
  } else {
    if (!(v.dailyAmount > 0)) return 'El interés por día tiene que ser mayor a cero.';
    if (v.dueDate <= v.startDate) return 'La fecha de pago tiene que ser posterior a la fecha de inicio.';
  }
  if (Number.isNaN(v.lateFee.value) || v.lateFee.value < 0) return 'El valor de la mora no es válido.';
  if (v.partner) {
    if (Number.isNaN(v.partner.value) || v.partner.value < 0) return 'La parte del interés que se lleva el otro no es válida.';
    if (!v.partner.name) return 'Escribí el nombre de con quién compartís el interés.';
    const max = v.mode === 'daily' ? v.dailyAmount : v.percent;
    if (v.partner.value > max) return v.mode === 'daily' ? 'Su parte por día no puede ser mayor que el interés diario.' : 'Su parte no puede ser mayor que el porcentaje total.';
  }
  return '';
}

function updateLoanForm(form) {
  if (!form) return;
  updateWhen(form);
  const v = readLoanForm(form);
  const out = form.querySelector('.preview:not(.preview--fee)');
  const cur = v.currency;
  const inst = v.installments.filter((q) => q.date && q.amount > 0);
  if (v.mode === 'installments') updateRatePreview(form, inst[0]?.amount || 0, cur, true);
  else updateRatePreview(form, v.capital, cur);
  const days = v.startDate && v.dueDate ? diffDays(v.startDate, v.dueDate) : 0;
  let html = '';
  if (v.mode === 'installments' && inst.length) {
    const total = round2(inst.reduce((s, q) => s + q.amount, 0));
    const gain = round2(total - (v.capital > 0 ? v.capital : 0));
    html = `<strong>Total a devolver: ${money(total, cur)}</strong>
      <span>${plural(inst.length, 'cuota', 'cuotas')}, de ${dateShort(inst[0].date, todayISO())} a ${dateShort(inst[inst.length - 1].date, todayISO())}</span>
      ${v.capital > 0 ? `<span class="${gain < 0 ? 'is-red' : ''}">${gain >= 0 ? `Ganancia: ${money(gain, cur)}` : `Las cuotas no cubren el capital: faltan ${money(-gain, cur)}`}</span>` : ''}`;
  } else if (v.mode === 'daily' && v.dailyAmount > 0 && days > 0) {
    const t = loanTerms({ ...v, capital: v.capital > 0 ? v.capital : 0 });
    html = `<span>Interés: ${plural(days, 'día', 'días')} × ${money(v.dailyAmount, cur)} = ${money(t.interest, cur)}</span>
      ${v.capital > 0 ? `<strong>Total a devolver: ${money(t.total, cur)}</strong><span>Capital ${money(v.capital, cur)} + interés ${money(t.interest, cur)}, el ${dateShort(v.dueDate, todayISO())}</span>` : ''}
      <span class="hint">Se cuenta desde el día siguiente al préstamo (${dateShort(addDays(v.startDate, 1), todayISO())}) hasta la fecha de pago, inclusive.</span>`;
  } else if (v.mode === 'percent' && v.capital > 0 && !Number.isNaN(v.percent)) {
    const t = loanTerms(v);
    html = `<strong>Total a devolver: ${money(t.total, cur)}</strong>
      <span>Interés: ${money(t.interest, cur)}${days > 0 ? ` en ${plural(days, 'día', 'días')}` : ''}</span>`;
  }
  out.innerHTML = html;
  out.hidden = !html;
  updatePartnerPreview(form, v);
}

/** "Vos: $ 50.000 · Juan: $ 10.000" debajo del reparto. */
function updatePartnerPreview(form, v) {
  const out = form.querySelector('.preview--partner');
  if (!out) return;
  let html = '';
  const p = v.partner;
  if (p && p.value > 0 && v.capital > 0) {
    const t = loanTerms({ ...v, capital: v.capital });
    const days = Math.max(0, diffDays(v.startDate, v.dueDate));
    const theirs = Math.min(t.interest, v.mode === 'daily' ? p.value * days : (v.capital * p.value) / 100);
    const mine = t.interest - theirs;
    const cur = v.currency;
    const lbl = v.mode === 'daily' ? (x) => `${money(x / Math.max(days, 1), cur)} por día` : (x) => `${amountForInput(round2((x / v.capital) * 100))} %`;
    if (t.interest > 0) {
      html = `<strong>Vos: ${money(mine, cur)} <small>(${lbl(mine)})</small></strong>
        <span>${esc(p.name || 'El otro')}: ${money(theirs, cur)} <small>(${lbl(theirs)})</small></span>
        <span class="hint">El deudor igual te devuelve ${money(t.total, cur)}.</span>`;
    }
  }
  out.innerHTML = html;
  out.hidden = !html;
}

function saveLoan(form) {
  const v = readLoanForm(form);
  const error = validateLoan(v);
  const $err = form.querySelector('.form-error');
  if (error) {
    $err.textContent = error;
    $err.hidden = false;
    $err.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  let personId = v.personId;
  if (personId === '__new') {
    personId = store.uid();
    db.people.push({ id: personId, name: v.newName, phone: v.newPhone, notes: '' });
  }
  const id = form.elements.id?.value;
  const existing = id ? loanById(id) : null;
  const data = {
    personId,
    direction: v.direction,
    currency: v.currency,
    capital: v.capital,
    startDate: v.startDate,
    // En cuotas, la fecha de pago es la de la última cuota.
    dueDate: v.mode === 'installments' ? v.installments[v.installments.length - 1].date : v.dueDate,
    mode: v.mode,
    percent: v.mode === 'percent' ? v.percent : 0,
    dailyAmount: v.mode === 'daily' ? v.dailyAmount : 0,
    installments: v.mode === 'installments' ? v.installments.map((q) => ({ id: store.uid(), date: q.date, amount: q.amount })) : [],
    graceDays: v.mode === 'installments' ? v.graceDays : 0,
    schedule: v.mode === 'installments' ? v.schedule : null,
    lateFee: v.lateFee,
    lateFeeFrom: v.lateFeeFrom,
    notes: v.notes,
    partner: v.partner && v.partner.value > 0 ? v.partner : null,
  };
  let loanId;
  if (existing) {
    Object.assign(existing, data);
    delete existing.lateFeePerDay; // formato viejo, reemplazado por `lateFee`
    loanId = existing.id;
  } else {
    loanId = store.uid();
    db.loans.push({ id: loanId, ...data, lateFeeChanges: [], forgivenAt: null, payments: [], createdAt: new Date().toISOString() });
    ui.dir = v.direction;
    store.setPref('dir', ui.dir);
  }
  persist();
  toast(existing ? 'Cambios guardados' : 'Préstamo guardado');
  go(`#/prestamo/${loanId}`);
}

// ---------------------------------------------------------------------------
// Pagos (hoja inferior)
// ---------------------------------------------------------------------------

function openSheet(html) {
  $sheet.innerHTML = `<div class="sheet-handle" aria-hidden="true"></div>${html}`;
  if (!$sheet.open) $sheet.showModal();
  const first = $sheet.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 50);
}

function closeSheet() {
  if ($sheet.open) $sheet.close();
}

function paymentSheet(loan, payment) {
  const c = computeLoan(loan);
  const cur = loan.currency;
  const suggestions = [];
  if (!payment) {
    if (c.balance > 0) suggestions.push(['Saldo total', c.balance]);
    if (loan.mode === 'installments' && c.nextInstallment) {
      const late = c.installments.filter((it) => it.state === 'late');
      if (late.length > 1) suggestions.push(['Cuotas atrasadas', round2(late.reduce((s, it) => s + it.remaining, 0))]);
      if (c.nextInstallment.remaining < c.balance) suggestions.push([`Cuota ${c.nextInstallment.n}`, c.nextInstallment.remaining]);
    }
  }
  openSheet(`
    <form class="form sheet-form" data-form="payment" method="dialog" novalidate>
      <input type="hidden" name="loanId" value="${loan.id}">
      ${payment ? `<input type="hidden" name="paymentId" value="${payment.id}">` : ''}
      <h2 class="sheet-title">${payment ? 'Editar pago' : 'Registrar pago'}</h2>
      ${group(`
        <label class="field">
          <span class="field-label">Monto (${cur === 'USD' ? 'US$' : '$'})</span>
          <input name="amount" type="text" inputmode="decimal" placeholder="0" value="${payment ? amountForInput(payment.amount) : ''}" required autofocus enterkeyhint="done">
        </label>
        ${
          suggestions.length
            ? `<div class="chips chips--inline">${suggestions
                .map(([label, value]) => `<button type="button" class="chip" data-action="fill-amount" data-value="${value}">${label}: ${money(value, cur)}</button>`)
                .join('')}</div>`
            : ''
        }
        <label class="field">
          <span class="field-label">Fecha</span>
          <input name="date" type="date" value="${payment ? payment.date : todayISO()}" required>
        </label>
        <label class="field">
          <span class="field-label">Nota</span>
          <input name="note" type="text" placeholder="Opcional, ej.: transferencia" value="${esc(payment?.note || '')}">
        </label>`)}
      <p class="form-error" role="alert" hidden></p>
      <div class="sheet-actions">
        <button type="button" class="button tappable" data-action="close-sheet">Cancelar</button>
        <button type="submit" class="button button--primary tappable">Guardar</button>
      </div>
    </form>`);
}

function savePayment(form) {
  const f = new FormData(form);
  const loan = loanById(f.get('loanId'));
  if (!loan) return closeSheet();
  const amount = parseAmount(f.get('amount'));
  const date = f.get('date');
  const $err = form.querySelector('.form-error');
  const fail = (msg) => {
    $err.textContent = msg;
    $err.hidden = false;
  };
  if (!(amount > 0)) return fail('Ingresá un monto mayor a cero.');
  if (!date) return fail('Elegí la fecha del pago.');
  if (date < loan.startDate) return fail('El pago no puede ser anterior al inicio del préstamo.');
  const note = String(f.get('note') || '').trim();
  const paymentId = f.get('paymentId');
  if (paymentId) {
    Object.assign(loan.payments.find((p) => p.id === paymentId), { amount, date, note });
  } else {
    loan.payments.push({ id: store.uid(), amount, date, note });
  }
  persist();
  closeSheet();
  const c = computeLoan(loan);
  toast(c.status === 'paid' ? '¡Préstamo saldado!' : `Pago registrado. Queda ${money(c.balance, loan.currency)}`);
  render({ keepScroll: true });
}

function paymentMenu(loan, payment) {
  openSheet(`
    <div class="sheet-form">
      <h2 class="sheet-title">${money(payment.amount, loan.currency)}</h2>
      <p class="sheet-sub">${dateLong(payment.date)}${payment.note ? ` · ${esc(payment.note)}` : ''}</p>
      ${group(`
        <button type="button" class="row row--action tappable" data-action="edit-payment" data-id="${payment.id}">${icon('edit')}<span>Editar pago</span></button>
        <button type="button" class="row row--action row--danger tappable" data-action="delete-payment" data-id="${payment.id}">${icon('trash')}<span>Eliminar pago</span></button>
      `)}
      <div class="sheet-actions"><button type="button" class="button button--block tappable" data-action="close-sheet">Cerrar</button></div>
    </div>`);
}

// ---------------------------------------------------------------------------
// Cambiar la mora diaria (hoja inferior)
// ---------------------------------------------------------------------------

function feeSheet(loan) {
  const c = computeLoan(loan);
  const cur = loan.currency;
  const today = todayISO();
  openSheet(`
    <form class="form sheet-form" data-form="fee" method="dialog" novalidate>
      <input type="hidden" name="loanId" value="${loan.id}">
      <h2 class="sheet-title">Cambiar mora</h2>
      <p class="sheet-sub">Ahora: ${rateLabel(c.currentRate, cur, loan.mode)}</p>
      <input type="hidden" name="mode" value="${loan.mode}">
      ${segmented('scope', [['from', 'Desde una fecha'], ['all', 'Todo el préstamo']], 'from', { form: true })}
      ${group(`
        ${rateFields(c.currentRate, cur, { autofocus: true })}
        <label class="field" data-when="scope:from">
          <span class="field-label">A partir del</span>
          <input name="from" type="date" value="${today}">
        </label>`)}
      <p class="hint hint--sheet" data-when="scope:from">La mora de los días anteriores queda como estaba. La nueva tarifa corre desde la fecha elegida.</p>
      <p class="hint hint--sheet" data-when="scope:all">Se recalcula toda la mora del préstamo con la nueva tarifa, también la de los días pasados, y se borran los cambios anteriores.</p>
      <p class="form-error" role="alert" hidden></p>
      <div class="sheet-actions">
        <button type="button" class="button tappable" data-action="close-sheet">Cancelar</button>
        <button type="submit" class="button button--primary tappable">Guardar</button>
      </div>
    </form>`);
  const form = $sheet.querySelector('form');
  updateWhen(form);
  updateRatePreview(form, ...feeBase(loan));
}

/** Base para la vista previa de la mora: capital, o la próxima cuota si el préstamo es en cuotas. */
function feeBase(loan) {
  if (loan.mode !== 'installments') return [loan.capital, loan.currency, false];
  const c = computeLoan(loan);
  return [(c.nextInstallment || sortedInstallments(loan)[0])?.amount || 0, loan.currency, true];
}

/** Muestra u oculta los elementos con data-when="campo:valor" según el formulario. */
function updateWhen(form) {
  if (!form) return;
  const f = new FormData(form);
  form.querySelectorAll('[data-when]').forEach((el) => {
    el.hidden = !el.dataset.when.split(';').every((cond) => {
      const [k, vals] = cond.split(':');
      return vals.split('|').includes(f.get(k));
    });
  });
}

function saveFee(form) {
  const f = new FormData(form);
  const loan = loanById(f.get('loanId'));
  if (!loan) return closeSheet();
  const rate = readRate(f);
  const $err = form.querySelector('.form-error');
  const fail = (msg) => {
    $err.textContent = msg;
    $err.hidden = false;
  };
  if (Number.isNaN(rate.value) || rate.value < 0) return fail('Ingresá un valor válido (0 para dejar de cobrar mora).');
  if (f.get('scope') === 'all') {
    loan.lateFee = rate;
    delete loan.lateFeePerDay;
    loan.lateFeeChanges = [];
  } else {
    const from = f.get('from');
    if (!from) return fail('Elegí desde qué fecha rige.');
    loan.lateFeeChanges = (loan.lateFeeChanges || []).filter((ch) => ch.from !== from);
    loan.lateFeeChanges.push({ id: store.uid(), from, rate });
  }
  persist();
  closeSheet();
  toast('Mora actualizada');
  render({ keepScroll: true });
}

function feeChangeMenu(loan, ch) {
  openSheet(`
    <div class="sheet-form">
      <h2 class="sheet-title">${rateLabel(ch.rate ?? ch.amount, loan.currency, loan.mode)}</h2>
      <p class="sheet-sub">Desde el ${dateLong(ch.from)}</p>
      ${group(`<button type="button" class="row row--action row--danger tappable" data-action="delete-fee-change" data-id="${ch.id}">${icon('trash')}<span>Eliminar este cambio</span></button>`, {
        footer: 'Si lo eliminás, esos días se recalculan con la tarifa anterior.',
      })}
      <div class="sheet-actions"><button type="button" class="button button--block tappable" data-action="close-sheet">Cerrar</button></div>
    </div>`);
}

// ---------------------------------------------------------------------------
// Vistas: personas
// ---------------------------------------------------------------------------

function peopleView() {
  const asOf = todayISO();
  const people = [...db.people].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const rows = people
    .map((p) => {
      const net = netByPerson(p.id, asOf);
      const overdue = net.items.some((i) => i.c.status === 'overdue');
      return `
      <a class="row tappable" href="#/persona/${p.id}">
        <span class="avatar" aria-hidden="true">${esc(initials(p.name))}</span>
        <span class="row-main">
          <span class="row-title">${esc(p.name)}</span>
          <span class="row-sub ${overdue ? 'is-red' : ''}">${netText(net)}</span>
        </span>
        <span class="row-end">${icon('chevron', 'row-chevron')}</span>
      </a>`;
    })
    .join('');
  return {
    title: 'Personas',
    tab: 'people',
    large: true,
    right: `<a class="nav-action tappable" href="#/persona/nueva" aria-label="Nueva persona">${icon('plus')}</a>`,
    body: people.length
      ? group(rows)
      : emptyState('Sin personas', 'Se agregan solas cuando cargás un préstamo, o podés crearlas acá.', `<a class="button button--primary tappable" href="#/persona/nueva">${icon('plus')}Agregar persona</a>`),
  };
}

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

const phoneDigits = (phone) => String(phone || '').replace(/\D/g, '');

function personDetailView(person) {
  if (!person) return notFoundView();
  const asOf = todayISO();
  const net = netByPerson(person.id, asOf);
  const items = net.items.sort(compareLoans);
  const digits = phoneDigits(person.phone);

  const contact = person.phone
    ? group(`
        ${kv('Teléfono', esc(person.phone))}
        <a class="row row--action tappable" href="tel:${esc(person.phone.replace(/[^\d+]/g, ''))}">${icon('phone')}<span>Llamar</span></a>
        <a class="row row--action tappable" href="https://wa.me/${digits}" target="_blank" rel="noopener">${icon('chat')}<span>Abrir WhatsApp</span></a>`)
    : '';

  const byDir = (dir) => items.filter((i) => i.loan.direction === dir);
  const section = (dir, title) => {
    const list = byDir(dir);
    return list.length ? group(list.map((i) => loanRow(i, { showPerson: false, asOf })).join(''), { title }) : '';
  };

  return {
    title: person.name,
    back: { href: '#/personas', label: 'Personas' },
    right: `<a class="nav-text tappable" href="#/persona/${person.id}/editar">Editar</a>`,
    body: `
      <section class="hero hero--person">
        <span class="avatar avatar--lg" aria-hidden="true">${esc(initials(person.name))}</span>
        <h1 class="hero-name">${esc(person.name)}</h1>
        <p class="hero-meta">${netText(net)}</p>
      </section>
      ${contact}
      ${section('lent', 'Le prestaste')}
      ${section('borrowed', 'Te prestó')}
      ${person.notes ? group(`<p class="notes">${esc(person.notes)}</p>`, { title: 'Notas' }) : ''}
      ${group(`<a class="row row--action tappable" href="#/prestamo/nuevo?persona=${person.id}">${icon('plus')}<span>Nuevo préstamo con ${esc(person.name.split(' ')[0])}</span></a>`)}
    `,
  };
}

function personFormView(person) {
  const editing = Boolean(person);
  const p = person || { name: '', phone: '', notes: '' };
  const hasLoans = editing && db.loans.some((l) => l.personId === person.id);
  return {
    title: editing ? 'Editar persona' : 'Nueva persona',
    back: { href: editing ? `#/persona/${person.id}` : '#/personas', label: 'Cancelar' },
    body: `
      <form class="form" data-form="person" novalidate autocomplete="off">
        ${editing ? `<input type="hidden" name="id" value="${person.id}">` : ''}
        ${group(`
          <label class="field"><span class="field-label">Nombre</span>
            <input name="name" type="text" value="${esc(p.name)}" placeholder="Ej.: Juan Pérez" autocapitalize="words" required ${editing ? '' : 'autofocus'}></label>
          <label class="field"><span class="field-label">Teléfono</span>
            <input name="phone" type="tel" value="${esc(p.phone)}" placeholder="+54 9 11 1234-5678"></label>
          <label class="field"><span class="field-label">Notas</span>
            <textarea name="notes" rows="3" placeholder="Opcional: dirección, alias, de dónde lo conocés…">${esc(p.notes)}</textarea></label>`,
          { footer: 'Para que funcione WhatsApp, cargá el teléfono con el código de país (en Argentina, +54 9).' },
        )}
        <p class="form-error" role="alert" hidden></p>
        <button type="submit" class="button button--primary button--block tappable">${editing ? 'Guardar cambios' : 'Guardar persona'}</button>
        ${
          editing
            ? group(
                `<button type="button" class="row row--action row--danger tappable" data-action="delete-person" data-id="${person.id}" ${hasLoans ? 'disabled' : ''}>${icon('trash')}<span>Eliminar persona</span></button>`,
                { footer: hasLoans ? 'Para eliminarla, primero borrá sus préstamos.' : '' },
              )
            : ''
        }
      </form>`,
  };
}

function savePerson(form) {
  const f = new FormData(form);
  const name = String(f.get('name') || '').trim();
  const $err = form.querySelector('.form-error');
  if (!name) {
    $err.textContent = 'Escribí el nombre.';
    $err.hidden = false;
    return;
  }
  const data = { name, phone: String(f.get('phone') || '').trim(), notes: String(f.get('notes') || '').trim() };
  const id = f.get('id');
  let personId = id;
  if (id) Object.assign(personById(id), data);
  else {
    personId = store.uid();
    db.people.push({ id: personId, ...data });
  }
  persist();
  toast('Persona guardada');
  go(`#/persona/${personId}`);
}

// ---------------------------------------------------------------------------
// Vista: reportes
// ---------------------------------------------------------------------------

const pctFmt = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 });
const monthFmt = new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'UTC' });
const monthYearFmt = new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' });

const stat = (label, value, sub = '', cls = '') => `
  <div class="stat ${cls}">
    <span class="stat-label">${label}</span>
    <span class="stat-value">${value}</span>
    ${sub ? `<span class="stat-sub">${sub}</span>` : ''}
  </div>`;

function reportsView() {
  const asOf = todayISO();
  const curs = CURRENCIES.filter((cur) => db.loans.some((l) => l.currency === cur));
  if (!curs.length) {
    return {
      title: 'Reportes',
      tab: 'reports',
      large: true,
      body: emptyState('Todavía no hay datos', 'Cuando cargues préstamos vas a ver acá cuánto invertiste, cuánto ganaste y cuánto falta cobrar.'),
    };
  }
  const cur = curs.includes(ui.reportCur) ? ui.reportCur : curs[0];
  const m = (n) => money(n, cur);
  const lent = db.loans.filter((l) => l.currency === cur && l.direction === 'lent');
  const borrowed = db.loans.filter((l) => l.currency === cur && l.direction === 'borrowed');
  const lentItems = lent.map((l) => withCalc(l, asOf));
  const r = profitReport(lentItems);
  const b = profitReport(borrowed.map((l) => withCalc(l, asOf)));

  let lentSection = '';
  if (lent.length) {
    const hero = `
      <section class="summary">
        <p class="summary-label">${r.partnerRealized || r.partnerPending ? 'Tu ganancia cobrada' : 'Ganancia cobrada'}</p>
        <p class="summary-amount is-accent">${m(r.realized)}</p>
        <p class="summary-meta">Sobre ${m(r.invested)} prestados · rendimiento ${pctFmt.format(r.roi)}</p>
      </section>`;

    const stats = `
      <div class="stats">
        ${stat('Capital prestado', m(r.invested), plural(r.count, 'préstamo', 'préstamos'))}
        ${stat('En la calle', m(r.inStreet), 'Capital sin recuperar')}
        ${stat('Cobrado', m(r.collected), 'Capital + ganancia')}
        ${stat('Por cobrar', m(r.balance), plural(r.open, 'préstamo abierto', 'préstamos abiertos'))}
        ${stat('Ganancia por cobrar', m(r.pending), 'Interés + mora a hoy')}
        ${stat('Rendimiento esperado', pctFmt.format(r.expectedRoi), 'Si se cobra todo')}
        ${stat('Mora generada', m(r.mora), 'Incluida en lo anterior')}
        ${r.partnerRealized || r.partnerPending ? stat('Parte de terceros', m(r.partnerRealized + r.partnerPending), `Cobrado: ${m(r.partnerRealized)}`) : ''}
        ${r.lost || r.forgivenProfit ? stat('Condonado', m(r.lost + r.forgivenProfit), `Capital perdido: ${m(r.lost)}`, 'stat--warn') : ''}
      </div>`;

    const months = paymentsByMonth(lent, asOf, 6);
    const max = Math.max(...months.map((x) => x.total), 0);
    const bars = group(
      months
        .map(({ month, total }) => {
          const d = new Date(`${month}-01T00:00:00Z`);
          const label = (month.slice(0, 4) === asOf.slice(0, 4) ? monthFmt : monthYearFmt).format(d).replace('.', '');
          const w = max > 0 ? Math.max(total > 0 ? 2 : 0, (total / max) * 100) : 0;
          return `
          <div class="bar-row" role="listitem">
            <span class="bar-label">${label}</span>
            <span class="bar-track" aria-hidden="true"><span class="bar" style="width:${w.toFixed(1)}%"></span></span>
            <span class="bar-value ${total ? '' : 'is-muted'}">${m(total)}</span>
          </div>`;
        })
        .join(''),
      { title: 'Cobros por mes', footer: `Total de los últimos 6 meses: ${m(months.reduce((s, x) => s + x.total, 0))}`, cls: 'group--bars' },
    );

    const byPerson = {};
    for (const { loan, c } of lentItems) {
      if (!isOpen(c.status)) continue;
      byPerson[loan.personId] = round2((byPerson[loan.personId] || 0) + c.balance);
    }
    const top = Object.entries(byPerson)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5);
    const topGroup = top.length
      ? group(
          top
            .map(
              ([pid, bal]) => `
          <a class="row tappable" href="#/persona/${pid}">
            <span class="avatar" aria-hidden="true">${esc(initials(personById(pid)?.name || '?'))}</span>
            <span class="row-main">
              <span class="row-title">${esc(personById(pid)?.name || 'Sin nombre')}</span>
              <span class="row-sub">${pctFmt.format(r.balance ? bal / r.balance : 0)} de lo que te deben</span>
            </span>
            <span class="row-end"><span class="row-amount">${m(bal)}</span>${icon('chevron', 'row-chevron')}</span>
          </a>`,
            )
            .join(''),
          { title: 'Quién te debe más' },
        )
      : '';

    lentSection = `${hero}${stats}${bars}${topGroup}`;
  }

  const borrowedSection = borrowed.length
    ? group(
        `
        ${kv('Te prestaron', m(b.invested))}
        ${kv('Pagaste', m(b.collected))}
        ${kv('Intereses y mora', m(b.realized + b.pending), '')}
        ${kv('Todavía debés', `<strong>${m(b.balance)}</strong>`, 'row--total')}`,
        { title: 'Lo que debés', footer: 'Intereses y mora: lo que pagás (o vas a pagar) por encima del capital.' },
      )
    : '';

  return {
    title: 'Reportes',
    tab: 'reports',
    large: true,
    body: `
      ${curs.length > 1 ? segmented('cur', curs.map((x) => [x, x === 'ARS' ? 'Pesos' : 'Dólares']), cur, { action: 'set-report-cur' }) : ''}
      ${lentSection || (borrowed.length ? '' : emptyState('Sin préstamos en esta moneda', ''))}
      ${borrowedSection}
      <p class="about">La ganancia se calcula considerando que cada pago cubre primero el capital y después el interés y la mora. Si compartís el interés con alguien, tu ganancia ya tiene descontada su parte.</p>`,
  };
}

// ---------------------------------------------------------------------------
// Vista: ajustes y backup
// ---------------------------------------------------------------------------

function settingsView() {
  const last = store.getPref('lastBackup', '');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return {
    title: 'Ajustes',
    tab: 'settings',
    large: true,
    body: `
      ${group(
        `
        <button type="button" class="row row--action tappable" data-action="export">${icon('download')}<span>Exportar backup</span></button>
        <label class="row row--action tappable">${icon('upload')}<span>Importar backup</span>
          <input type="file" accept="application/json,.json" data-action-change="import" hidden></label>`,
        {
          title: 'Backup',
          footer: `${last ? `Último backup: ${dateLong(last)}.` : 'Todavía no hiciste ningún backup.'} Guardalo en Archivos o en iCloud. Importar un backup reemplaza todos los datos actuales.`,
        },
      )}
      ${group(
        `
        ${kv('Préstamos', db.loans.length)}
        ${kv('Personas', db.people.length)}
        <button type="button" class="row row--action row--danger tappable" data-action="wipe" ${db.loans.length || db.people.length ? '' : 'disabled'}>${icon('trash')}<span>Borrar todos los datos</span></button>`,
        { title: 'Datos', footer: 'Todo se guarda solo en este teléfono. No se manda nada a ningún servidor.' },
      )}
      ${
        standalone
          ? ''
          : group(
              `<p class="notes">En Safari, tocá <strong>Compartir</strong> ${icon('share', 'icon--inline')} y después <strong>Agregar a pantalla de inicio</strong>. Así se abre como una app, funciona sin internet y iOS no borra los datos por falta de uso.</p>`,
              { title: 'Instalar en el iPhone' },
            )
      }
      ${group(
        `
        ${kv('Versión', APP_VERSION)}
        <button type="button" class="row row--action tappable" data-action="force-update">${icon('download')}<span>Buscar actualización</span></button>`,
        { title: 'App', footer: 'Baja de nuevo la última versión publicada. Tus préstamos no se borran.' },
      )}`,
  };
}

/** Borra la app guardada (service worker y caché) y recarga desde internet. No toca localStorage. */
async function forceUpdate() {
  if (!navigator.onLine) return toast('Necesitás conexión a internet para actualizar.', 'error');
  toast('Buscando actualización…');
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    if (globalThis.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch {
    /* si falla la limpieza, igual recargamos */
  }
  store.setPref('justUpdated', APP_VERSION);
  location.reload();
}

async function exportBackup() {
  const json = JSON.stringify({ app: 'app-prestamos', exportedAt: new Date().toISOString(), ...db }, null, 2);
  const name = `prestamos-backup-${todayISO()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const done = () => {
    store.setPref('lastBackup', todayISO());
    toast('Backup exportado');
    render({ keepScroll: true });
  };
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Backup de Préstamos' });
      return done();
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  done();
}

async function importBackup(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const data = store.normalize(JSON.parse(await file.text()));
    const msg = `El backup tiene ${plural(data.loans.length, 'préstamo', 'préstamos')} y ${plural(data.people.length, 'persona', 'personas')}.\n\nVa a reemplazar todo lo que hay ahora en la app. ¿Continuar?`;
    if (!confirm(msg)) return;
    db = data;
    persist();
    toast('Backup importado');
    render();
  } catch (e) {
    toast(e instanceof SyntaxError ? 'El archivo no es un JSON válido.' : e.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Compartir por WhatsApp / copiar el detalle
// ---------------------------------------------------------------------------

/**
 * Texto con el detalle del préstamo.
 * `greeting`: arranca con "Hola X, te paso el resumen…" (para mandar por WhatsApp);
 * si no, arranca con quién es, cuánto debe y desde cuándo (para copiar).
 */
function loanSummaryText(loan, { greeting = false } = {}) {
  const asOf = todayISO();
  const c = computeLoan(loan, asOf);
  const person = personById(loan.personId);
  const m = (n) => money(n, loan.currency);
  const name = person?.name || 'Sin nombre';
  const first = person?.name.split(' ')[0] || '';
  const lines = greeting
    ? [`Hola${first ? ` ${first}` : ''}, te paso el resumen del préstamo al ${dateNumeric(asOf)}:`, '']
    : [
        `*Préstamo ${loan.direction === 'borrowed' ? 'de' : 'a'} ${name}* (al ${dateNumeric(asOf)})`,
        isOpen(c.status)
          ? `${loan.direction === 'borrowed' ? 'Le debo' : 'Me debe'} ${m(Math.max(0, c.balance))} · ${STATUS[c.status].label}`
          : STATUS[c.status].label,
        `Desde el ${dateNumeric(loan.startDate)} (${plural(Math.max(0, diffDays(loan.startDate, asOf)), 'día', 'días')})`,
        '',
      ];
  lines.push(`• Capital: ${m(loan.capital)} (desde el ${dateNumeric(loan.startDate)})`);
  if (loan.mode === 'installments') {
    const STATE = { paid: 'pagada ✅', pending: 'pendiente', grace: 'vencida, en margen', late: 'atrasada' };
    lines.push(`• ${plural(c.installments.length, 'cuota', 'cuotas')}, total ${m(c.total)}:`);
    for (const it of c.installments) {
      lines.push(`   ${it.n}) ${dateNumeric(it.date)} · ${m(it.amount)} · ${STATE[it.state]}${it.state !== 'paid' && it.covered > 0 ? ` (falta ${m(it.remaining)})` : ''}${it.mora ? ` · mora ${m(it.mora)}` : ''}`);
    }
    if (loan.graceDays) lines.push(`• Margen por cuota: ${plural(loan.graceDays, 'día', 'días')}`);
  } else {
    lines.push(
      loan.mode === 'daily'
        ? `• Interés: ${plural(c.days, 'día', 'días')} × ${m(loan.dailyAmount)} = ${m(c.interest)}`
        : `• Interés: ${amountForInput(loan.percent)} % = ${m(c.interest)}`,
      `• Total acordado: ${m(c.total)}`,
      `• Fecha de pago: ${dateNumeric(loan.dueDate)}`,
    );
  }
  if (c.mora && loan.mode === 'installments') {
    lines.push(`• Mora total: ${m(c.mora)}`);
  } else if (c.mora) {
    if (c.moraSegments.length === 1) lines.push(`• Mora: ${plural(c.moraDays, 'día', 'días')} × ${m(c.moraSegments[0].fee)} = ${m(c.mora)}`);
    else {
      lines.push(`• Mora: ${m(c.mora)}`);
      for (const s of c.moraSegments) lines.push(`   – ${dateNumeric(s.from)} al ${dateNumeric(s.to)}: ${plural(s.days, 'día', 'días')} × ${m(s.fee)}`);
    }
  }
  const payments = [...loan.payments].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (payments.length) {
    lines.push(`• Pagos (${payments.length}):`);
    for (const p of payments) lines.push(`   – ${dateNumeric(p.date)}: ${m(p.amount)}${p.date > asOf ? ' (programado)' : ''}${p.note ? ` · ${p.note}` : ''}`);
  } else {
    lines.push('• Pagos: ninguno todavía');
  }
  lines.push(`• Pagado: ${m(c.paid)}`);
  lines.push(
    c.status === 'paid'
      ? '• Saldado ✅'
      : c.status === 'forgiven'
        ? `• Condonado (quedaban ${m(Math.max(0, c.balance))})`
        : `• *Saldo a hoy: ${m(Math.max(0, c.balance))}*`,
  );
  if (!greeting && loan.notes) lines.push('', `Notas: ${loan.notes}`);
  return lines.join('\n');
}

function shareLoan(loan) {
  const text = encodeURIComponent(loanSummaryText(loan, { greeting: true }));
  const digits = phoneDigits(personById(loan.personId)?.phone);
  window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener');
}

async function copyLoan(loan) {
  const text = loanSummaryText(loan);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Respaldo para navegadores sin la API del portapapeles (o sin HTTPS).
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) return toast('No se pudo copiar el detalle.', 'error');
  }
  toast('Detalle copiado');
}

// ---------------------------------------------------------------------------
// Otras vistas
// ---------------------------------------------------------------------------

function notFoundView() {
  return {
    title: 'No encontrado',
    back: { href: '#/', label: 'Préstamos' },
    body: emptyState('No encontramos lo que buscabas', 'Puede que se haya eliminado.', `<a class="button tappable" href="#/">Volver al inicio</a>`),
  };
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastTimer;
function toast(message, kind = 'ok') {
  $toast.textContent = message;
  $toast.dataset.kind = kind;
  $toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('is-visible'), kind === 'error' ? 4000 : 2200);
}

// ---------------------------------------------------------------------------
// Acciones (delegación de eventos)
// ---------------------------------------------------------------------------

const currentLoan = () => {
  const { parts } = parseHash();
  return parts[0] === 'prestamo' ? loanById(parts[1]) : null;
};

const actions = {
  'set-dir'(el) {
    ui.dir = el.dataset.value;
    store.setPref('dir', ui.dir);
    render({ keepScroll: true });
  },
  'set-filter'(el) {
    ui.filter = el.dataset.value;
    render({ keepScroll: true });
  },
  'add-payment'() {
    const loan = currentLoan();
    if (loan) paymentSheet(loan);
  },
  'payment-menu'(el) {
    const loan = currentLoan();
    const payment = loan?.payments.find((p) => p.id === el.dataset.id);
    if (payment) paymentMenu(loan, payment);
  },
  'edit-payment'(el) {
    const loan = currentLoan();
    const payment = loan?.payments.find((p) => p.id === el.dataset.id);
    if (payment) paymentSheet(loan, payment);
  },
  'delete-payment'(el) {
    const loan = currentLoan();
    if (!loan || !confirm('¿Eliminar este pago?')) return;
    loan.payments = loan.payments.filter((p) => p.id !== el.dataset.id);
    persist();
    closeSheet();
    toast('Pago eliminado');
    render({ keepScroll: true });
  },
  'fill-amount'(el) {
    const input = $sheet.querySelector('input[name="amount"]');
    input.value = amountForInput(Number(el.dataset.value));
    input.focus();
  },
  'close-sheet': closeSheet,
  'change-fee'() {
    const loan = currentLoan();
    if (loan) feeSheet(loan);
  },
  'fee-change-menu'(el) {
    const loan = currentLoan();
    const ch = loan?.lateFeeChanges?.find((x) => x.id === el.dataset.id);
    if (ch) feeChangeMenu(loan, ch);
  },
  'delete-fee-change'(el) {
    const loan = currentLoan();
    if (!loan) return;
    loan.lateFeeChanges = (loan.lateFeeChanges || []).filter((x) => x.id !== el.dataset.id);
    persist();
    closeSheet();
    toast('Cambio de mora eliminado');
    render({ keepScroll: true });
  },
  'set-report-cur'(el) {
    ui.reportCur = el.dataset.value;
    render({ keepScroll: true });
  },
  'share-loan'() {
    const loan = currentLoan();
    if (loan) shareLoan(loan);
  },
  'copy-loan'() {
    const loan = currentLoan();
    if (loan) copyLoan(loan);
  },
  forgive() {
    const loan = currentLoan();
    if (!loan) return;
    const c = computeLoan(loan);
    if (!confirm(`¿Condonar el saldo de ${money(c.balance, loan.currency)}? El préstamo queda cerrado y deja de sumar mora. Después lo podés reactivar.`)) return;
    loan.forgivenAt = todayISO();
    persist();
    toast('Préstamo condonado');
    render({ keepScroll: true });
  },
  unforgive() {
    const loan = currentLoan();
    if (!loan) return;
    loan.forgivenAt = null;
    persist();
    toast('Préstamo reactivado');
    render({ keepScroll: true });
  },
  'delete-loan'() {
    const loan = currentLoan();
    if (!loan || !confirm('¿Eliminar este préstamo y todos sus pagos? No se puede deshacer.')) return;
    db.loans = db.loans.filter((l) => l.id !== loan.id);
    persist();
    toast('Préstamo eliminado');
    go('#/');
  },
  'delete-person'(el) {
    if (db.loans.some((l) => l.personId === el.dataset.id)) return;
    if (!confirm('¿Eliminar esta persona?')) return;
    db.people = db.people.filter((p) => p.id !== el.dataset.id);
    persist();
    toast('Persona eliminada');
    go('#/personas');
  },
  export: exportBackup,
  'force-update': forceUpdate,
  wipe() {
    if (!confirm('¿Borrar TODOS los préstamos y personas de este teléfono? Te conviene exportar un backup antes.')) return;
    if (!confirm('Última confirmación: esto no se puede deshacer.')) return;
    db = store.emptyDb();
    persist();
    toast('Datos borrados');
    render();
  },
};

const forms = { loan: saveLoan, payment: savePayment, person: savePerson, fee: saveFee };

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) {
    e.preventDefault();
    fn(el, e);
  }
});

document.addEventListener('submit', (e) => {
  const fn = forms[e.target.dataset.form];
  if (fn) {
    e.preventDefault();
    fn(e.target);
  }
});

function refreshFeeForm(form) {
  updateWhen(form);
  const loan = loanById(new FormData(form).get('loanId'));
  if (loan) updateRatePreview(form, ...feeBase(loan));
}

/** Si cambió un dato del generador de cuotas (cantidad, monto, primera fecha, frecuencia), rearmarlas. */
const isGenField = (el) => el.hasAttribute('data-gen') || el.name === 'genFreq';

document.addEventListener('input', (e) => {
  const feeForm = e.target.closest('form[data-form="fee"]');
  if (feeForm) return refreshFeeForm(feeForm);
  const form = e.target.closest('form[data-form="loan"]');
  if (!form) return;
  if (isGenField(e.target)) regenerateInstallments(form);
  updateLoanForm(form);
});

document.addEventListener('change', (e) => {
  if (e.target.dataset.actionChange === 'import') return importBackup(e.target);
  const feeForm = e.target.closest('form[data-form="fee"]');
  if (feeForm) return refreshFeeForm(feeForm);
  const form = e.target.closest('form[data-form="loan"]');
  if (!form) return;
  if (isGenField(e.target)) regenerateInstallments(form);
  updateLoanForm(form);
});

$sheet.addEventListener('click', (e) => {
  if (e.target === $sheet) closeSheet();
});

window.addEventListener('hashchange', () => {
  closeSheet();
  render();
});

// Si la app queda abierta de un día para el otro, recalcular estados y mora al volver
// (sin pisar un formulario a medio completar).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$sheet.open && !$app.querySelector('form')) {
    render({ keepScroll: true });
  }
});

render();
store.requestPersistence();

if (store.getPref('justUpdated', '')) {
  store.setPref('justUpdated', '');
  toast(`App actualizada a la versión ${APP_VERSION}`);
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // updateViaCache: 'none' → al buscar una versión nueva del service worker no se usa la caché HTTP.
  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
}

// Exportado solo para depurar desde la consola.
window.__prestamos = { get db() { return db; }, computeLoan, round2 };
