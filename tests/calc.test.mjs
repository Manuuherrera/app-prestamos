import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLoan, loanTerms, totalsByCurrency, lateFeeStart } from '../js/calc.js';
import { parseAmount, money } from '../js/format.js';

const base = {
  id: 'l1',
  personId: 'p1',
  direction: 'lent',
  currency: 'ARS',
  capital: 100000,
  startDate: '2026-01-01',
  dueDate: '2026-02-01',
  mode: 'percent',
  percent: 20,
  dailyAmount: 0,
  lateFeePerDay: 1000,
  lateFeeFrom: null,
  payments: [],
};
const loan = (over = {}) => ({ ...base, ...over });

test('porcentaje: total = capital + %', () => {
  assert.equal(loanTerms(loan()).total, 120000);
  assert.equal(loanTerms(loan()).interest, 20000);
  assert.equal(loanTerms(loan({ percent: 0 })).total, 100000);
});

test('al día y vence pronto', () => {
  assert.equal(computeLoan(loan(), '2026-01-15').status, 'current');
  assert.equal(computeLoan(loan(), '2026-01-29').status, 'dueSoon');
  assert.equal(computeLoan(loan(), '2026-02-01').status, 'dueSoon');
  assert.equal(computeLoan(loan(), '2026-02-01').mora, 0);
});

test('vencido: corre la mora fija desde el día siguiente al vencimiento', () => {
  const c = computeLoan(loan(), '2026-02-05');
  assert.equal(c.status, 'overdue');
  assert.equal(c.daysOverdue, 4);
  assert.equal(c.moraDays, 4);
  assert.equal(c.mora, 4000);
  assert.equal(c.balance, 124000);
});

test('pagar el saldo del día corta la mora', () => {
  // El 3/2 el saldo es 120.000 + 2 días de mora (2/2 y 3/2).
  const l = loan({ payments: [{ id: 'x', date: '2026-02-03', amount: 122000 }] });
  const c = computeLoan(l, '2026-03-01');
  assert.equal(c.mora, 2000);
  assert.equal(c.balance, 0);
  assert.equal(c.status, 'paid');
});

test('pago parcial: la mora sigue corriendo mientras quede saldo', () => {
  const l = loan({ payments: [{ id: 'x', date: '2026-01-20', amount: 50000 }] });
  const c = computeLoan(l, '2026-02-11');
  assert.equal(c.paid, 50000);
  assert.equal(c.mora, 10000);
  assert.equal(c.balance, 80000);
});

test('préstamo viejo: "cobrar mora desde" posterga el inicio de la mora', () => {
  const l = loan({ lateFeeFrom: '2026-03-01' });
  assert.equal(lateFeeStart(l), '2026-03-01');
  const c = computeLoan(l, '2026-03-03');
  assert.equal(c.moraDays, 3);
  assert.equal(c.mora, 3000);
  // Una fecha anterior al vencimiento no adelanta la mora.
  assert.equal(lateFeeStart(loan({ lateFeeFrom: '2026-01-10' })), '2026-02-02');
});

test('sin mora acordada: vencido pero no suma', () => {
  const c = computeLoan(loan({ lateFeePerDay: 0 }), '2026-03-01');
  assert.equal(c.status, 'overdue');
  assert.equal(c.mora, 0);
  assert.equal(c.balance, 120000);
});

test('pagos futuros no cuentan todavía', () => {
  const l = loan({ payments: [{ id: 'x', date: '2026-01-20', amount: 10000 }] });
  assert.equal(computeLoan(l, '2026-01-10').paid, 0);
});

test('cuota diaria: total = cuota × días y detecta atraso en cuotas', () => {
  const l = loan({ mode: 'daily', dailyAmount: 5000, dueDate: '2026-01-31' });
  const t = loanTerms(l);
  assert.equal(t.installments, 30);
  assert.equal(t.total, 150000);
  assert.equal(t.interest, 50000);

  const behind = computeLoan({ ...l, payments: [{ id: 'a', date: '2026-01-08', amount: 40000 }] }, '2026-01-11');
  assert.equal(behind.expected, 50000);
  assert.equal(behind.behindBy, 10000);
  assert.equal(behind.installmentsBehind, 2);
  assert.equal(behind.status, 'behind');

  const ok = computeLoan({ ...l, payments: [{ id: 'a', date: '2026-01-10', amount: 50000 }] }, '2026-01-10');
  assert.equal(ok.status, 'current');
});

test('cuota diaria vencida con saldo: corre la mora', () => {
  const l = loan({
    mode: 'daily',
    dailyAmount: 5000,
    dueDate: '2026-01-31',
    lateFeePerDay: 2000,
    payments: [{ id: 'a', date: '2026-01-31', amount: 140000 }],
  });
  const c = computeLoan(l, '2026-02-03');
  assert.equal(c.status, 'overdue');
  assert.equal(c.mora, 6000);
  assert.equal(c.balance, 16000);
});

test('condonado: congela la mora en la fecha de condonación', () => {
  const l = loan({ forgivenAt: '2026-02-03' });
  const c = computeLoan(l, '2026-03-01');
  assert.equal(c.status, 'forgiven');
  assert.equal(c.mora, 2000);
});

test('totales por moneda: solo préstamos abiertos', () => {
  const items = [
    { loan: loan(), c: computeLoan(loan(), '2026-02-05') },
    { loan: loan({ currency: 'USD', capital: 100, percent: 10 }), c: computeLoan(loan({ currency: 'USD', capital: 100, percent: 10, lateFeePerDay: 0 }), '2026-01-10') },
    { loan: loan(), c: computeLoan(loan({ payments: [{ id: 'p', date: '2026-01-02', amount: 120000 }] }), '2026-02-05') },
  ];
  const t = totalsByCurrency(items);
  assert.equal(t.ARS.balance, 124000);
  assert.equal(t.ARS.count, 1);
  assert.equal(t.ARS.overdue, 1);
  assert.equal(t.USD.balance, 110);
});

test('parseAmount entiende el formato argentino', () => {
  assert.equal(parseAmount('120000'), 120000);
  assert.equal(parseAmount('120.000'), 120000);
  assert.equal(parseAmount('1.500'), 1500);
  assert.equal(parseAmount('1.234.567,89'), 1234567.89);
  assert.equal(parseAmount('1500,5'), 1500.5);
  assert.equal(parseAmount('1500.75'), 1500.75);
  assert.equal(parseAmount('$ 2.000'), 2000);
  assert.ok(Number.isNaN(parseAmount('')));
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('-5')));
});

test('money formatea pesos y dólares', () => {
  assert.match(money(120000, 'ARS'), /120\.000/);
  assert.match(money(1500.5, 'USD'), /1\.500,50/);
  assert.match(money(1500.5, 'USD'), /US\$/);
});
