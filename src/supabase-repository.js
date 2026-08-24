const { createClient } = require('@supabase/supabase-js');
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

function toExpense(row) {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    category: row.category,
    description: row.description,
    paidBy: row.paid_by,
    createdBy: row.created_by,
    expenseDate: row.expense_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toBudget(row) {
  return {
    month: row.month,
    amountCents: row.amount_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function fromExpense(expense) {
  return {
    id: expense.id,
    amount_cents: expense.amountCents,
    category: expense.category,
    description: expense.description,
    paid_by: expense.paidBy,
    created_by: expense.createdBy,
    expense_date: expense.expenseDate,
    created_at: expense.createdAt,
    updated_at: expense.updatedAt
  };
}

function assertSupabaseEnv() {
  if (!getSupabaseUrl() || !getSupabaseSecretKey()) {
    throw new Error('חסרים משתני Supabase URL או מפתח שרת Supabase');
  }
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.SUPABASE_URL_SUPABASE_URL || '';
}

function getSupabaseSecretKey() {
  return process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_URL_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_URL_SUPABASE_SERVICE_ROLE_KEY ||
    '';
}

function createSupabaseRepository(client) {
  const supabase = client || (() => {
    assertSupabaseEnv();
    return createClient(getSupabaseUrl(), getSupabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  })();

  async function must(query) {
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }

  async function listCategories() {
    const rows = await must(supabase.from('categories').select('name'));
    return sortCategories(rows.map((row) => row.name));
  }

  async function allBudgets() {
    const rows = await must(supabase.from('budgets').select('*').order('month'));
    return rows.map(toBudget);
  }

  async function allExpenses() {
    const rows = await must(supabase.from('expenses').select('*').order('expense_date').order('id'));
    return rows.map(toExpense);
  }

  async function getBudget(month) {
    const rows = await must(supabase.from('budgets').select('*').eq('month', normalizeMonth(month)).limit(1));
    return rows[0] ? toBudget(rows[0]) : null;
  }

  async function setBudget(month, amountCents) {
    const normalizedMonth = normalizeMonth(month);
    const normalizedAmount = normalizeAmount(amountCents);
    const current = await getBudget(normalizedMonth);
    const timestamp = nowIso();
    const payload = {
      month: normalizedMonth,
      amount_cents: normalizedAmount,
      created_at: current?.createdAt || timestamp,
      updated_at: timestamp
    };
    const rows = await must(supabase.from('budgets').upsert(payload, { onConflict: 'month' }).select('*'));
    return toBudget(rows[0]);
  }

  async function addExpense(input, user) {
    const expense = validateExpenseInput(input, user);
    const timestamp = nowIso();
    const rows = await must(supabase.from('expenses').insert({
      amount_cents: expense.amountCents,
      category: expense.category,
      description: expense.description,
      paid_by: expense.paidBy,
      created_by: expense.createdBy,
      expense_date: expense.expenseDate,
      created_at: timestamp,
      updated_at: timestamp
    }).select('*'));
    return toExpense(rows[0]);
  }

  async function updateExpense(id, input) {
    const existing = await expenseById(id);
    const expense = validateExpenseInput({
      amountCents: input.amountCents ?? existing.amountCents,
      category: input.category ?? existing.category,
      description: input.description ?? existing.description,
      paidBy: input.paidBy ?? existing.paidBy,
      createdBy: existing.createdBy,
      expenseDate: input.expenseDate ?? existing.expenseDate
    }, existing.createdBy);
    const rows = await must(supabase.from('expenses').update({
      amount_cents: expense.amountCents,
      category: expense.category,
      description: expense.description,
      paid_by: expense.paidBy,
      expense_date: expense.expenseDate,
      updated_at: nowIso()
    }).eq('id', Number(id)).select('*'));
    if (!rows[0]) throw new Error('הוצאה לא נמצאה');
    return toExpense(rows[0]);
  }

  async function expenseById(id) {
    const rows = await must(supabase.from('expenses').select('*').eq('id', Number(id)).limit(1));
    if (!rows[0]) throw new Error('הוצאה לא נמצאה');
    return toExpense(rows[0]);
  }

  async function deleteExpense(id) {
    const existing = await expenseById(id);
    await must(supabase.from('expenses').delete().eq('id', Number(id)));
    return existing;
  }

  async function undoLastExpense(user) {
    const rows = await must(
      supabase.from('expenses')
        .select('*')
        .eq('created_by', user)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
    );
    if (!rows[0]) return null;
    await must(supabase.from('expenses').delete().eq('id', rows[0].id));
    return toExpense(rows[0]);
  }

  async function getSummary(month, filters = {}) {
    const normalizedMonth = normalizeMonth(month);
    const [budgets, expenses] = await Promise.all([allBudgets(), allExpenses()]);
    return calculateSummary(normalizedMonth, budgets, expenses, filters);
  }

  async function getHistory() {
    const [budgets, expenses] = await Promise.all([allBudgets(), allExpenses()]);
    const months = new Set(budgets.map((item) => item.month));
    for (const expense of expenses) months.add(expense.expenseDate.slice(0, 7));
    return [...months].sort().reverse().map((month) => calculateSummary(month, budgets, expenses));
  }

  async function exportBackup() {
    const [categories, budgets, expenses] = await Promise.all([listCategories(), allBudgets(), allExpenses()]);
    return {
      version: 1,
      exportedAt: nowIso(),
      users: [
        { id: 'ido', name: 'עידו' },
        { id: 'karina', name: 'קארינה' }
      ],
      categories,
      budgets,
      expenses
    };
  }

  async function restoreBackup(backup) {
    validateBackup(backup);
    const categories = backup.categories.length ? backup.categories : CATEGORIES;
    await must(supabase.rpc('restore_home_budget', {
      payload: {
        categories,
        budgets: backup.budgets,
        expenses: backup.expenses
      }
    }));
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
  createSupabaseRepository,
  fromExpense,
  getSupabaseSecretKey,
  getSupabaseUrl,
  toBudget,
  toExpense
};
