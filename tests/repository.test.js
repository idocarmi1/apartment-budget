const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryRepository } = require('../src/memory-repository');

test('שמירת הוצאה וטעינה מחדש', async () => {
  const repo = createMemoryRepository();
  await repo.addExpense({
    amountCents: 25000,
    category: 'סופר',
    description: 'סופר',
    paidBy: 'ido',
    expenseDate: '2026-08-24'
  }, 'ido');
  const summary = await repo.getSummary('2026-08');
  assert.equal(summary.expenses.length, 1);
  assert.equal(summary.expenses[0].amountCents, 25000);
});

test('חישוב תקציב, הוצאות ויתרה', async () => {
  const repo = createMemoryRepository();
  await repo.setBudget('2026-08', 600000);
  await repo.addExpense({
    amountCents: 145000,
    category: 'סופר',
    description: 'קניות',
    paidBy: 'karina',
    expenseDate: '2026-08-20'
  }, 'karina');
  const summary = await repo.getSummary('2026-08');
  assert.equal(summary.budgetCents, 600000);
  assert.equal(summary.totalCents, 145000);
  assert.equal(summary.remainingCents, 455000);
});

test('הפרדה נכונה בין חודשים ומעבר חודש לא מוחק היסטוריה', async () => {
  const repo = createMemoryRepository();
  await repo.setBudget('2026-08', 600000);
  await repo.addExpense({
    amountCents: 10000,
    category: 'חשמל',
    description: 'חשמל אוגוסט',
    paidBy: 'ido',
    expenseDate: '2026-08-01'
  }, 'ido');
  await repo.setBudget('2026-09', 700000);
  await repo.addExpense({
    amountCents: 20000,
    category: 'מים',
    description: 'מים ספטמבר',
    paidBy: 'karina',
    expenseDate: '2026-09-01'
  }, 'karina');
  const august = await repo.getSummary('2026-08');
  const september = await repo.getSummary('2026-09');
  const history = await repo.getHistory();
  assert.equal(august.totalCents, 10000);
  assert.equal(september.totalCents, 20000);
  assert.deepEqual(history.map((item) => item.month), ['2026-09', '2026-08']);
});

test('חישוב כמה כל משתמש שילם', async () => {
  const repo = createMemoryRepository();
  await repo.addExpense({
    amountCents: 85000,
    category: 'סופר',
    description: 'סופר',
    paidBy: 'ido',
    expenseDate: '2026-08-02'
  }, 'ido');
  await repo.addExpense({
    amountCents: 60000,
    category: 'ניקיון',
    description: 'ניקיון',
    paidBy: 'karina',
    expenseDate: '2026-08-03'
  }, 'karina');
  const summary = await repo.getSummary('2026-08');
  assert.equal(summary.paidBy.ido.amountCents, 85000);
  assert.equal(summary.paidBy.karina.amountCents, 60000);
});

test('שני לקוחות רואים שינוי אחרי טעינה מחודשת', async () => {
  const repo = createMemoryRepository();
  await repo.addExpense({
    amountCents: 30000,
    category: 'תחבורה',
    description: 'רכבת',
    paidBy: 'ido',
    expenseDate: '2026-08-04'
  }, 'ido');
  const otherClientSummary = await repo.getSummary('2026-08');
  assert.equal(otherClientSummary.expenseCount, 1);
  assert.equal(otherClientSummary.totalCents, 30000);
});

test('עריכה ומחיקה נראות בטעינה הבאה', async () => {
  const repo = createMemoryRepository();
  const expense = await repo.addExpense({
    amountCents: 10000,
    category: 'אחר',
    description: 'ישן',
    paidBy: 'ido',
    expenseDate: '2026-08-05'
  }, 'ido');
  await repo.updateExpense(expense.id, { amountCents: 12000, description: 'חדש', category: 'סופר', paidBy: 'karina', expenseDate: '2026-08-05' });
  let summary = await repo.getSummary('2026-08');
  assert.equal(summary.totalCents, 12000);
  assert.equal(summary.expenses[0].description, 'חדש');
  await repo.deleteExpense(expense.id);
  summary = await repo.getSummary('2026-08');
  assert.equal(summary.expenseCount, 0);
});

test('ייצוא ושחזור גיבוי', async () => {
  const repo = createMemoryRepository();
  await repo.setBudget('2026-08', 600000);
  await repo.addExpense({
    amountCents: 25000,
    category: 'סופר',
    description: 'סופר',
    paidBy: 'ido',
    expenseDate: '2026-08-06'
  }, 'ido');
  const backup = await repo.exportBackup();
  const restoredRepo = createMemoryRepository();
  await restoredRepo.restoreBackup(backup);
  const summary = await restoredRepo.getSummary('2026-08');
  assert.equal(summary.budgetCents, 600000);
  assert.equal(summary.totalCents, 25000);
});

test('שחזור כושל אינו מוחק נתונים קיימים', async () => {
  const repo = createMemoryRepository();
  await repo.addExpense({
    amountCents: 25000,
    category: 'סופר',
    description: 'סופר',
    paidBy: 'ido',
    expenseDate: '2026-08-06'
  }, 'ido');
  await assert.rejects(() => repo.restoreBackup({ broken: true }), /מבנה גיבוי/);
  const summary = await repo.getSummary('2026-08');
  assert.equal(summary.totalCents, 25000);
});
