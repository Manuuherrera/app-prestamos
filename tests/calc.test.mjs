import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLoan, loanTerms, totalsByCurrency, lateFeeStart, feeOn, profitReport, paymentsByMonth } from '../js/calc.js';
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

test('cambio de mora desde una fecha: lo anterior queda igual', () => {
  // Vence 1/2. Mora 1000 del 2/2 al 9/2 (8 días), desde el 10/2 pasa a 3000.
  const l = loan({ lateFeeChanges: [{ id: 'c1', from: '2026-02-10', amount: 3000 }] });
  assert.equal(feeOn(l, '2026-02-09'), 1000);
  assert.equal(feeOn(l, '2026-02-10'), 3000);
  const c = computeLoan(l, '2026-02-12');
  assert.equal(c.mora, 8 * 1000 + 3 * 3000);
  assert.equal(c.moraDays, 11);
  assert.equal(c.currentFee, 3000);
  assert.deepEqual(
    c.moraSegments.map((s) => [s.from, s.to, s.days, s.fee, s.subtotal]),
    [
      ['2026-02-02', '2026-02-09', 8, 1000, 8000],
      ['2026-02-10', '2026-02-12', 3, 3000, 9000],
    ],
  );
});

test('cambio de mora a cero: deja de sumar pero lo pasado queda', () => {
  const l = loan({ lateFeeChanges: [{ id: 'c1', from: '2026-02-05', amount: 0 }] });
  const c = computeLoan(l, '2026-03-01');
  assert.equal(c.mora, 3000);
  assert.equal(c.status, 'overdue');
});

test('mora base cero con cambio posterior: empieza a cobrar desde el cambio', () => {
  const l = loan({ lateFeePerDay: 0, lateFeeChanges: [{ id: 'c1', from: '2026-02-20', amount: 500 }] });
  assert.equal(computeLoan(l, '2026-02-21').mora, 1000);
});

test('mora por porcentaje diario sobre el capital (no baja con pagos parciales)', () => {
  // 1 % diario de 100.000 = 1.000 por día
  const l = loan({ lateFeePerDay: undefined, lateFee: { type: 'percent', value: 1, period: 'day' }, payments: [{ id: 'p', date: '2026-01-20', amount: 50000 }] });
  const c = computeLoan(l, '2026-02-05');
  assert.equal(c.mora, 4000);
  assert.equal(c.balance, 120000 + 4000 - 50000);
});

test('mora por semana y por mes se prorratea por día', () => {
  const week = loan({ lateFee: { type: 'percent', value: 7, period: 'week' } }); // 7.000/semana → 1.000/día
  assert.equal(computeLoan(week, '2026-02-04').mora, 3000);
  const month = loan({ lateFee: { type: 'fixed', value: 30000, period: 'month' } }); // 30.000/mes → 1.000/día
  assert.equal(computeLoan(month, '2026-02-04').mora, 3000);
  const odd = loan({ lateFee: { type: 'percent', value: 1, period: 'week' } }); // 1.000/7 = 142,86 por día
  assert.equal(computeLoan(odd, '2026-02-08').mora, 1000.02); // 7 × 142,86
});

test('cambio de fijo a porcentaje desde una fecha', () => {
  const l = loan({ lateFeeChanges: [{ id: 'c', from: '2026-02-04', rate: { type: 'percent', value: 2, period: 'day' } }] });
  const c = computeLoan(l, '2026-02-05');
  assert.equal(c.mora, 2 * 1000 + 2 * 2000);
  assert.equal(c.moraSegments.length, 2);
  assert.equal(c.currentRate.type, 'percent');
});

test('reporte de ganancia: los pagos cubren primero el capital', () => {
  const a = loan({ payments: [{ id: 'p', date: '2026-01-20', amount: 120000 }] }); // cerrado, ganó 20.000
  const b = loan({ capital: 50000, percent: 10, payments: [{ id: 'q', date: '2026-01-10', amount: 20000 }] }); // abierto
  const f = loan({ capital: 30000, percent: 50, forgivenAt: '2026-01-15', payments: [{ id: 'r', date: '2026-01-05', amount: 10000 }] });
  const asOf = '2026-01-25';
  const r = profitReport([a, b, f].map((l) => ({ loan: l, c: computeLoan(l, asOf) })));
  assert.equal(r.invested, 180000);
  assert.equal(r.collected, 150000);
  assert.equal(r.realized, 20000);
  assert.equal(r.inStreet, 30000);
  assert.equal(r.pending, 5000);
  assert.equal(r.balance, 35000);
  assert.equal(r.lost, 20000);
  assert.equal(r.forgivenProfit, 15000);
  assert.equal(r.open, 1);
  assert.equal(r.closed, 2);
  assert.ok(Math.abs(r.roi - 20000 / 180000) < 1e-9);
});

test('cobros por mes', () => {
  const l = loan({
    payments: [
      { id: 'a', date: '2026-01-05', amount: 1000 },
      { id: 'b', date: '2026-03-10', amount: 2000 },
      { id: 'c', date: '2026-03-20', amount: 500 },
      { id: 'd', date: '2025-06-01', amount: 9999 },
    ],
  });
  assert.deepEqual(paymentsByMonth([l], '2026-03-25', 3), [
    { month: '2026-01', total: 1000 },
    { month: '2026-02', total: 0 },
    { month: '2026-03', total: 2500 },
  ]);
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
