/**
 * tests.mjs
 * Automated unit test suite to verify financial projection calculations.
 * Run with: node tests.mjs
 */

import { invoiceRefForPurchase, compileProjections, compileInvestments } from './financialEngine.js';
import { Expense, CreditCard, Investment } from './domainModels.js';

let passes = 0;
let fails = 0;

function assert(condition, message) {
  if (condition) {
    passes++;
    console.log(`\x1b[32m[PASS]\x1b[0m ${message}`);
  } else {
    fails++;
    console.error(`\x1b[31m[FAIL]\x1b[0m ${message}`);
  }
}

console.log("Iniciando testes unitários do iFinc Pro...\n");

// --- TEST 1: invoiceRefForPurchase (Brazil Credit Card Statement rollover) ---
try {
  // Test case A: purchase day <= card dueDay
  // Purchase: May 5th, 2026. Card due day: 10th.
  // Result should be May 2026 (2026-05)
  const d1 = new Date(2026, 4, 5); // Month is 0-indexed (4 = May)
  const ref1 = invoiceRefForPurchase(d1, 10);
  assert(ref1 === '2026-05', `Compra no dia 5 com vencimento dia 10 cai na fatura '2026-05' (recebido: '${ref1}')`);

  // Test case B: purchase day > card dueDay
  // Purchase: May 15th, 2026. Card due day: 10th.
  // Result should cascade to June 2026 (2026-06)
  const d2 = new Date(2026, 4, 15);
  const ref2 = invoiceRefForPurchase(d2, 10);
  assert(ref2 === '2026-06', `Compra no dia 15 com vencimento dia 10 cai na fatura '2026-06' (recebido: '${ref2}')`);

  // Test case C: rollover month bounds (December to January)
  // Purchase: Dec 20th, 2026. Card due day: 10th.
  // Result should cascade to Jan 2027 (2027-01)
  const d3 = new Date(2026, 11, 20); // 11 = December
  const ref3 = invoiceRefForPurchase(d3, 10);
  assert(ref3 === '2027-01', `Compra em dezembro de 2026 após o dia 10 cai na fatura de janeiro de 2027 '2027-01' (recebido: '${ref3}')`);
} catch (e) {
  fails++;
  console.error("Erro no teste 1:", e);
}

// --- TEST 2: compileProjections & Installment Amortization ---
try {
  const cards = [
    new CreditCard({ id: 'card-1', name: 'Nubank', dueDay: 10 })
  ];
  const categories = [{ name: 'Alimentação' }, { name: 'Transporte' }];

  // 1. Credit Card purchase with 3 installments
  // Purchase date: May 15th, 2026. Value: R$ 300. Installments: 3.
  // Base invoice reference month: June 2026 (2026-06).
  // Distributes R$ 100 to June 2026, July 2026, August 2026.
  const expenses = [
    new Expense({
      id: 'exp-1',
      date: '2026-05-15',
      description: 'Geladeira',
      value: 300,
      category: 'Alimentação',
      method: 'Card',
      cardId: 'card-1',
      installments: 3,
      isLoan: false
    }, categories),
    // 2. Liquid outflow
    // Purchase date: May 5th, 2026. Value: R$ 50. Pix/Débito.
    // Falls into May 2026.
    new Expense({
      id: 'exp-2',
      date: '2026-05-05',
      description: 'Almoço',
      value: 50,
      category: 'Alimentação',
      method: 'PixDebito',
      isLoan: false
    }, categories)
  ];

  const projections = compileProjections(expenses, cards, 12);
  
  // Assert May 2026 cashflow (liquid = 50, credit = 0)
  const metricsMay = projections.monthlyMetrics['2026-05'];
  assert(metricsMay.liquidOutflow === 50, `Saída líquida em maio deve ser R$ 50 (recebido: ${metricsMay.liquidOutflow})`);
  assert(metricsMay.deferredLiabilities === 0, `Saídas diferidas em maio devem ser R$ 0 (recebido: ${metricsMay.deferredLiabilities})`);

  // Assert June 2026 cashflow (liquid = 0, credit = 100)
  const metricsJune = projections.monthlyMetrics['2026-06'];
  assert(metricsJune.liquidOutflow === 0, `Saída líquida em junho deve ser R$ 0 (recebido: ${metricsJune.liquidOutflow})`);
  assert(metricsJune.deferredLiabilities === 100, `Fatura de cartão em junho deve ser R$ 100 (recebido: ${metricsJune.deferredLiabilities})`);

  // Assert August 2026 cashflow (last installment, credit = 100)
  const metricsAug = projections.monthlyMetrics['2026-08'];
  assert(metricsAug.deferredLiabilities === 100, `Fatura de cartão em agosto deve ser R$ 100 (recebido: ${metricsAug.deferredLiabilities})`);

  // Assert September 2026 cashflow (no installments left, credit = 0)
  const metricsSept = projections.monthlyMetrics['2026-09'];
  assert(metricsSept.deferredLiabilities === 0, `Fatura de cartão em setembro deve ser R$ 0 (recebido: ${metricsSept.deferredLiabilities})`);

} catch (e) {
  fails++;
  console.error("Erro no teste 2:", e);
}

// --- TEST 3: compileInvestments (Preço Médio Ponderado) ---
try {
  const investments = [
    new Investment({ id: 'inv-1', date: '2026-05-01', asset: 'WEGE3', quantity: 10, averagePrice: 30.00 }),
    new Investment({ id: 'inv-2', date: '2026-05-15', asset: 'WEGE3', quantity: 20, averagePrice: 33.00 }),
  ];

  const summaries = compileInvestments(investments);
  assert(summaries.length === 1, `Deve resumir para exatamente 1 ativo ticker`);
  
  const wege = summaries[0];
  assert(wege.asset === 'WEGE3', `Ticker do ativo deve ser WEGE3`);
  assert(wege.totalQuantity === 30, `Quantidade acumulada deve ser 30 (recebido: ${wege.totalQuantity})`);
  
  // Total cost = (10 * 30) + (20 * 33) = 300 + 660 = 960
  // Average Price = 960 / 30 = 32.00
  assert(wege.averagePrice === 32.00, `Preço médio ponderado deve ser R$ 32,00 (recebido: R$ ${wege.averagePrice})`);
  assert(wege.totalCost === 960, `Custo total de aquisição deve ser R$ 960,00 (recebido: R$ ${wege.totalCost})`);
} catch (e) {
  fails++;
  console.error("Erro no teste 3:", e);
}

console.log(`\nResultados dos testes: ${passes} aprovados, ${fails} falhas.`);
process.exit(fails > 0 ? 1 : 0);
