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
} from './calc.js';
import * as store from './store.js';
import { money, dateLong, dateShort, dateNumeric, parseAmount, amountForInput, plural, esc } from './format.js';

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

let db = store.load();
const ui = {
  dir: store.getPref('dir', 'lent'),
  filter: 'active',
};

const $app = document.getElementById('app');
const $tabbar = document.getElementById('tabbar');
const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');

const CURRENCIES = ['ARS', 'USD'];

const STATUS = {
  overdue: { label: 'Vencido', tone: 'red' },
  behind: { label: 'Atrasado', tone: 'orange' },
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

function dueText(loan, c, asOf) {
  if (c.status === 'paid') return c.lastPayment ? `Pagado el ${dateShort(c.lastPayment, asOf)}` : 'Pagado';
  if (c.status === 'forgiven') return `Condonado el ${dateShort(loan.forgivenAt, asOf)}`;
  if (c.status === 'overdue') return `Venció hace ${plural(c.daysOverdue, 'día', 'días')}`;
  if (c.status === 'behind') return `Debe ${plural(Math.max(1, c.installmentsBehind), 'cuota', 'cuotas')}`;
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
  <div class="row row--static ${cls}">
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
  if (c.status === 'overdue') {
    callout = `<div class="callout callout--red">
      <strong>Venció hace ${plural(c.daysOverdue, 'día', 'días')}.</strong>
      ${loan.lateFeePerDay ? `Corre una mora de ${m(loan.lateFeePerDay)} por día${c.moraFrom > asOf ? ` desde el ${dateShort(c.moraFrom, asOf)}` : ''}.` : 'No tiene mora acordada.'}
    </div>`;
  } else if (c.status === 'behind') {
    callout = `<div class="callout callout--orange">
      <strong>Atrasado en ${plural(Math.max(1, c.installmentsBehind), 'cuota', 'cuotas')}.</strong>
      A hoy debería ${loan.direction === 'lent' ? 'haberte pagado' : 'haber recibido'} ${m(c.expected)} y lleva ${m(c.paid)}. Faltan ${m(c.behindBy)}.
    </div>`;
  } else if (c.status === 'dueSoon') {
    callout = `<div class="callout callout--yellow"><strong>${c.daysToDue === 0 ? 'Vence hoy.' : c.daysToDue === 1 ? 'Vence mañana.' : `Vence en ${c.daysToDue} días.`}</strong> ${loan.lateFeePerDay ? `Después corre una mora de ${m(loan.lateFeePerDay)} por día.` : ''}</div>`;
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
    loan.mode === 'daily'
      ? kv('Cuota diaria', `${m(loan.dailyAmount)} × ${c.installments}`)
      : kv('Interés', `${amountForInput(loan.percent)} %`);

  const summary = group(
    `
      ${kv('Capital', m(loan.capital))}
      ${terms}
      ${kv('Total acordado', m(c.total))}
      ${c.status === 'overdue' || c.mora ? kv('Mora', c.mora ? `${m(c.mora)} <small>(${plural(c.moraDays, 'día', 'días')} × ${m(loan.lateFeePerDay)})</small>` : m(0)) : ''}
      ${kv('Pagado', m(c.paid))}
      ${kv(open ? 'Saldo a hoy' : 'Saldo', `<strong>${m(Math.max(0, c.balance))}</strong>`, 'row--total')}
      ${c.balance < -0.004 ? kv('Pagado de más', m(-c.balance)) : ''}
    `,
    { title: 'Resumen' },
  );

  const dates = group(
    `
      ${kv('Fecha de inicio', dateLong(loan.startDate))}
      ${kv(loan.mode === 'daily' ? 'Última cuota' : 'Fecha de pago', dateLong(loan.dueDate))}
      ${kv('Mora por día', loan.lateFeePerDay ? m(loan.lateFeePerDay) : 'Sin mora')}
      ${loan.lateFeeFrom && loan.lateFeeFrom > addDays(loan.dueDate, 1) ? kv('Mora desde', dateLong(loan.lateFeeFrom)) : ''}
      ${kv('Moneda', cur === 'USD' ? 'Dólares' : 'Pesos')}
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
    body: `${hero}${callout}${summary}${paymentsGroup}${dates}${notes}${actions}`,
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
    lateFeePerDay: '',
    lateFeeFrom: null,
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
          ${segmented('mode', [['percent', 'Con porcentaje'], ['daily', 'Cuota diaria']], l.mode, { form: true })}
        </div>
        <label class="field" data-when="mode:percent">
          <span class="field-label">Interés total</span>
          <span class="input-affix"><input name="percent" type="text" inputmode="decimal" placeholder="0" value="${amountForInput(l.percent)}"><span>%</span></span>
        </label>
        <label class="field" data-when="mode:daily">
          <span class="field-label">Cuota por día</span>
          <input name="dailyAmount" type="text" inputmode="decimal" placeholder="0" value="${amountForInput(l.dailyAmount)}">
        </label>
        <label class="field">
          <span class="field-label" data-when="mode:percent">Fecha de pago acordada</span>
          <span class="field-label" data-when="mode:daily">Fecha de la última cuota</span>
          <input name="dueDate" type="date" value="${l.dueDate}" required>
        </label>
        <output class="preview" name="preview" aria-live="polite"></output>`,
        { title: 'Cómo se devuelve' },
      )}

      ${group(
        `
        <label class="field">
          <span class="field-label">Mora por día de atraso</span>
          <input name="lateFeePerDay" type="text" inputmode="decimal" placeholder="0 = sin mora" value="${amountForInput(l.lateFeePerDay)}">
        </label>
        <details class="field" ${l.lateFeeFrom ? 'open' : ''}>
          <summary>¿Es un préstamo viejo?</summary>
          <label class="field field--nested">
            <span class="field-label">Cobrar mora desde</span>
            <input name="lateFeeFrom" type="date" value="${l.lateFeeFrom || ''}">
          </label>
          <p class="hint">Si recién ahora empezás a cobrar la mora, poné desde qué día. Si lo dejás vacío, corre desde el día siguiente al vencimiento. Los pagos que ya te hicieron se cargan después, desde el detalle del préstamo.</p>
        </details>`,
        { title: 'Si no paga a tiempo', footer: 'La mora es un monto fijo que se suma por cada día de atraso mientras quede saldo.' },
      )}

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
    lateFeePerDay: f.get('lateFeePerDay') ? n('lateFeePerDay') : 0,
    lateFeeFrom: f.get('lateFeeFrom') || null,
    notes: String(f.get('notes') || '').trim(),
  };
}

function validateLoan(v) {
  if (!v.personId) return 'Elegí una persona o creá una nueva.';
  if (v.personId === '__new' && !v.newName) return 'Escribí el nombre de la persona.';
  if (!(v.capital > 0)) return 'El capital tiene que ser un monto mayor a cero.';
  if (!v.startDate || !v.dueDate) return 'Completá las fechas.';
  if (v.mode === 'percent') {
    if (Number.isNaN(v.percent) || v.percent < 0) return 'El porcentaje no es válido.';
    if (v.dueDate < v.startDate) return 'La fecha de pago no puede ser anterior al inicio.';
  } else {
    if (!(v.dailyAmount > 0)) return 'La cuota diaria tiene que ser mayor a cero.';
    if (v.dueDate <= v.startDate) return 'La última cuota tiene que ser posterior a la fecha de inicio.';
  }
  if (Number.isNaN(v.lateFeePerDay) || v.lateFeePerDay < 0) return 'La mora por día no es válida.';
  return '';
}

function updateLoanForm(form) {
  if (!form) return;
  const f = new FormData(form);
  form.querySelectorAll('[data-when]').forEach((el) => {
    const [k, val] = el.dataset.when.split(':');
    el.hidden = f.get(k) !== val;
  });
  const v = readLoanForm(form);
  const out = form.querySelector('.preview');
  const cur = v.currency;
  const days = v.startDate && v.dueDate ? diffDays(v.startDate, v.dueDate) : 0;
  let html = '';
  if (v.mode === 'daily' && v.dailyAmount > 0 && days > 0) {
    const t = loanTerms({ ...v, capital: v.capital || 0 });
    html = `<span>${plural(t.installments, 'cuota', 'cuotas')} de ${money(v.dailyAmount, cur)}</span>
      <strong>Total a devolver: ${money(t.total, cur)}</strong>
      ${v.capital > 0 ? `<span class="${t.interest < 0 ? 'is-red' : ''}">${t.interest >= 0 ? 'Ganancia' : 'Pierde'}: ${money(Math.abs(t.interest), cur)}</span>` : ''}`;
  } else if (v.mode === 'percent' && v.capital > 0 && !Number.isNaN(v.percent)) {
    const t = loanTerms(v);
    html = `<strong>Total a devolver: ${money(t.total, cur)}</strong>
      <span>Interés: ${money(t.interest, cur)}${days > 0 ? ` en ${plural(days, 'día', 'días')}` : ''}</span>`;
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
    dueDate: v.dueDate,
    mode: v.mode,
    percent: v.mode === 'percent' ? v.percent : 0,
    dailyAmount: v.mode === 'daily' ? v.dailyAmount : 0,
    lateFeePerDay: v.lateFeePerDay,
    lateFeeFrom: v.lateFeeFrom,
    notes: v.notes,
  };
  let loanId;
  if (existing) {
    Object.assign(existing, data);
    loanId = existing.id;
  } else {
    loanId = store.uid();
    db.loans.push({ id: loanId, ...data, forgivenAt: null, payments: [], createdAt: new Date().toISOString() });
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
    if (loan.mode === 'daily' && loan.dailyAmount > 0 && loan.dailyAmount < c.balance) suggestions.push(['Una cuota', loan.dailyAmount]);
    if (c.behindBy > 0 && c.behindBy < c.balance && c.behindBy !== loan.dailyAmount) suggestions.push(['Ponerse al día', c.behindBy]);
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
      <p class="about">Préstamos · v1.0</p>`,
  };
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
// Compartir por WhatsApp
// ---------------------------------------------------------------------------

function shareLoan(loan) {
  const c = computeLoan(loan);
  const person = personById(loan.personId);
  const m = (n) => money(n, loan.currency);
  const first = person?.name.split(' ')[0] || '';
  const lines = [
    `Hola${first ? ` ${first}` : ''}, te paso el resumen del préstamo al ${dateNumeric(todayISO())}:`,
    '',
    `• Capital: ${m(loan.capital)} (desde el ${dateNumeric(loan.startDate)})`,
    loan.mode === 'daily'
      ? `• ${c.installments} cuotas diarias de ${m(loan.dailyAmount)} = ${m(c.total)}`
      : `• Total acordado: ${m(c.total)} (${amountForInput(loan.percent)} % de interés)`,
    `• ${loan.mode === 'daily' ? 'Última cuota' : 'Fecha de pago'}: ${dateNumeric(loan.dueDate)}`,
  ];
  if (c.mora) lines.push(`• Mora: ${c.moraDays} días × ${m(loan.lateFeePerDay)} = ${m(c.mora)}`);
  lines.push(`• Pagado: ${m(c.paid)}`);
  lines.push(c.status === 'paid' ? '• Saldado ✅' : `• *Saldo a hoy: ${m(Math.max(0, c.balance))}*`);
  if (c.status === 'behind') lines.push(`• Atraso en cuotas: ${m(c.behindBy)}`);
  const text = encodeURIComponent(lines.join('\n'));
  const digits = phoneDigits(person?.phone);
  window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener');
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
  'share-loan'() {
    const loan = currentLoan();
    if (loan) shareLoan(loan);
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
  wipe() {
    if (!confirm('¿Borrar TODOS los préstamos y personas de este teléfono? Te conviene exportar un backup antes.')) return;
    if (!confirm('Última confirmación: esto no se puede deshacer.')) return;
    db = store.emptyDb();
    persist();
    toast('Datos borrados');
    render();
  },
};

const forms = { loan: saveLoan, payment: savePayment, person: savePerson };

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

document.addEventListener('input', (e) => {
  const form = e.target.closest('form[data-form="loan"]');
  if (form) updateLoanForm(form);
});

document.addEventListener('change', (e) => {
  if (e.target.dataset.actionChange === 'import') return importBackup(e.target);
  const form = e.target.closest('form[data-form="loan"]');
  if (form) updateLoanForm(form);
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

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Exportado solo para depurar desde la consola.
window.__prestamos = { get db() { return db; }, computeLoan, round2 };
