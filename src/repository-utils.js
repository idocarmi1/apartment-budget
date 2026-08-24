const { CATEGORIES } = require('./parser');
const { USERS, USER_NAMES } = require('./constants');

function nowIso() {
  return new Date().toISOString();
}

function normalizeMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error('חודש לא תקין');
  return month;
}

function normalizeDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('תאריך לא תקין');
  return date;
}

function normalizeUser(user) {
  if (!USERS.includes(user)) throw new Error('משתמש לא תקין');
  return user;
}

function normalizeAmount(amountCents) {
  if (!Number.isInteger(amountCents) || amountCents < 0) throw new Error('סכום לא תקין');
  return amountCents;
}

function validateExpenseInput(input, creatorFallback) {
  const amountCents = normalizeAmount(input.amountCents);
  if (amountCents <= 0) throw new Error('סכום חייב להיות גדול מאפס');
  const category = String(input.category || 'אחר').trim() || 'אחר';
  const description = String(input.description || category).trim();
  if (description.length > 140) throw new Error('תיאור ארוך מדי');
  const paidBy = normalizeUser(input.paidBy);
  const createdBy = normalizeUser(input.createdBy || creatorFallback);
  const expenseDate = normalizeDate(input.expenseDate);
  return { amountCents, category, description, paidBy, createdBy, expenseDate };
}

function sortCategories(categories) {
  return [...new Set(categories.length ? categories : CATEGORIES)].sort((a, b) => {
    if (a === 'אחר') return 1;
    if (b === 'אחר') return -1;
    return a.localeCompare(b, 'he');
  });
}

function calculateSummary(month, budgets, expenses, filters = {}) {
  const normalizedMonth = normalizeMonth(month);
  const allMonthExpenses = expenses.filter((expense) => expense.expenseDate.slice(0, 7) === normalizedMonth);
  const visibleExpenses = allMonthExpenses
    .filter((expense) => !filters.category || expense.category === filters.category)
    .filter((expense) => !filters.paidBy || expense.paidBy === filters.paidBy)
    .filter((expense) => {
      const q = String(filters.q || '').trim();
      if (!q) return true;
      return expense.description.includes(q) || expense.category.includes(q);
    })
    .sort((a, b) => `${b.expenseDate}-${b.id}`.localeCompare(`${a.expenseDate}-${a.id}`));

  const totalCents = allMonthExpenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const budget = budgets.find((item) => item.month === normalizedMonth) || null;
  const budgetCents = budget?.amountCents || 0;
  const byCategoryMap = new Map();
  const paidBy = Object.fromEntries(USERS.map((user) => [user, { amountCents: 0, count: 0, name: USER_NAMES[user] }]));

  for (const expense of allMonthExpenses) {
    const category = byCategoryMap.get(expense.category) || { category: expense.category, amountCents: 0, count: 0 };
    category.amountCents += expense.amountCents;
    category.count += 1;
    byCategoryMap.set(expense.category, category);
    paidBy[expense.paidBy].amountCents += expense.amountCents;
    paidBy[expense.paidBy].count += 1;
  }

  return {
    month: normalizedMonth,
    budget,
    budgetCents,
    totalCents,
    remainingCents: budgetCents - totalCents,
    utilization: budgetCents > 0 ? Math.round((totalCents / budgetCents) * 1000) / 10 : 0,
    expenseCount: allMonthExpenses.length,
    byCategory: [...byCategoryMap.values()].sort((a, b) => b.amountCents - a.amountCents),
    paidBy,
    expenses: visibleExpenses
  };
}

function validateBackup(backup) {
  if (!backup || !Array.isArray(backup.categories) || !Array.isArray(backup.budgets) || !Array.isArray(backup.expenses)) {
    throw new Error('מבנה גיבוי לא תקין');
  }
  for (const category of backup.categories) {
    if (!category || typeof category !== 'string') throw new Error('קטגוריה לא תקינה בגיבוי');
  }
  for (const budget of backup.budgets) {
    normalizeMonth(budget.month);
    normalizeAmount(budget.amountCents);
  }
  for (const expense of backup.expenses) {
    validateExpenseInput(expense, expense.createdBy);
    if (expense.id !== undefined && (!Number.isInteger(expense.id) || expense.id <= 0)) {
      throw new Error('מזהה הוצאה לא תקין בגיבוי');
    }
  }
}

module.exports = {
  calculateSummary,
  normalizeAmount,
  normalizeMonth,
  normalizeUser,
  nowIso,
  sortCategories,
  validateBackup,
  validateExpenseInput
};
