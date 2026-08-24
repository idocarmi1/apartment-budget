const { CATEGORIES } = require('./parser');
const {
  calculateSummary,
  normalizeAmount,
  normalizeMonth,
  nowIso,
  sortCategories,
  validateBackup,
  validateExpenseInput
} = require('./repository-utils');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryRepository(seed = {}) {
  let nextId = seed.nextId || 1;
  let categories = sortCategories(seed.categories || CATEGORIES);
  let budgets = clone(seed.budgets || []);
  let expenses = clone(seed.expenses || []);

  function listCategories() {
    return Promise.resolve(sortCategories(categories));
  }

  function getBudget(month) {
    const normalizedMonth = normalizeMonth(month);
    return Promise.resolve(budgets.find((budget) => budget.month === normalizedMonth) || null);
  }

  async function setBudget(month, amountCents) {
    const normalizedMonth = normalizeMonth(month);
    const normalizedAmount = normalizeAmount(amountCents);
    const existing = budgets.find((budget) => budget.month === normalizedMonth);
    const timestamp = nowIso();
    if (existing) {
      existing.amountCents = normalizedAmount;
      existing.updatedAt = timestamp;
      return clone(existing);
    }
    const budget = { month: normalizedMonth, amountCents: normalizedAmount, createdAt: timestamp, updatedAt: timestamp };
    budgets.push(budget);
    return clone(budget);
  }

  async function addExpense(input, user) {
    const expenseInput = validateExpenseInput(input, user);
    const timestamp = nowIso();
    const expense = { id: nextId++, ...expenseInput, createdAt: timestamp, updatedAt: timestamp };
    expenses.push(expense);
    return clone(expense);
  }

  async function updateExpense(id, input) {
    const expense = expenses.find((item) => item.id === Number(id));
    if (!expense) throw new Error('הוצאה לא נמצאה');
    const updated = validateExpenseInput({
      amountCents: input.amountCents ?? expense.amountCents,
      category: input.category ?? expense.category,
      description: input.description ?? expense.description,
      paidBy: input.paidBy ?? expense.paidBy,
      createdBy: expense.createdBy,
      expenseDate: input.expenseDate ?? expense.expenseDate
    }, expense.createdBy);
    Object.assign(expense, updated, { updatedAt: nowIso() });
    return clone(expense);
  }

  async function deleteExpense(id) {
    const index = expenses.findIndex((item) => item.id === Number(id));
    if (index === -1) throw new Error('הוצאה לא נמצאה');
    const [deleted] = expenses.splice(index, 1);
    return clone(deleted);
  }

  async function undoLastExpense(user) {
    const candidates = expenses.filter((item) => item.createdBy === user).sort((a, b) => `${b.createdAt}-${b.id}`.localeCompare(`${a.createdAt}-${a.id}`));
    if (!candidates[0]) return null;
    return deleteExpense(candidates[0].id);
  }

  function getSummary(month, filters = {}) {
    return Promise.resolve(calculateSummary(normalizeMonth(month), budgets, expenses, filters));
  }

  function getHistory() {
    const months = new Set(budgets.map((item) => item.month));
    for (const expense of expenses) months.add(expense.expenseDate.slice(0, 7));
    return Promise.resolve([...months].sort().reverse().map((month) => calculateSummary(month, budgets, expenses)));
  }

  function exportBackup() {
    return Promise.resolve({
      version: 1,
      exportedAt: nowIso(),
      users: [
        { id: 'ido', name: 'עידו' },
        { id: 'karina', name: 'קארינה' }
      ],
      categories: clone(categories),
      budgets: clone(budgets),
      expenses: clone(expenses)
    });
  }

  async function restoreBackup(backup) {
    validateBackup(backup);
    const nextCategories = sortCategories(backup.categories.length ? backup.categories : CATEGORIES);
    const nextBudgets = clone(backup.budgets);
    const nextExpenses = clone(backup.expenses);
    categories = nextCategories;
    budgets = nextBudgets;
    expenses = nextExpenses;
    nextId = Math.max(0, ...expenses.map((expense) => expense.id || 0)) + 1;
    return exportBackup();
  }

  return {
    listCategories,
    getBudget,
    setBudget,
    addExpense,
    updateExpense,
    deleteExpense,
    undoLastExpense,
    getSummary,
    getHistory,
    exportBackup,
    restoreBackup
  };
}

module.exports = {
  createMemoryRepository
};
