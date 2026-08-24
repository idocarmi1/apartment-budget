require('dotenv').config();
const { createSupabaseRepository } = require('../src/supabase-repository');

(async () => {
  const repo = createSupabaseRepository();
  const today = new Date();
  const month = today.toISOString().slice(0, 7);

  await repo.setBudget(month, 600000);
  await repo.addExpense({
    amountCents: 25000,
    category: 'סופר',
    description: 'קנייה שבועית',
    paidBy: 'ido',
    expenseDate: today.toISOString().slice(0, 10)
  }, 'ido');
  await repo.addExpense({
    amountCents: 8990,
    category: 'ניקיון',
    description: 'חומרי ניקיון',
    paidBy: 'karina',
    expenseDate: today.toISOString().slice(0, 10)
  }, 'karina');

  console.log('נוצרו נתוני דמו ב-Supabase. אפשר למחוק אותם מתוך האפליקציה או לשחזר מגיבוי.');
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
