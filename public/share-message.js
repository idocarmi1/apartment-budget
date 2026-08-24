(function attachShareMessage(root) {
  const APP_URL = 'https://apartment-budget.vercel.app';

  function userName(user) {
    return user === 'karina' ? 'קארינה' : 'עידו';
  }

  function paidVerb(user) {
    return user === 'karina' ? 'שילמה' : 'שילם';
  }

  function monthName(month) {
    const [year, monthNumber] = String(month || '').split('-').map(Number);
    if (!year || !monthNumber) return 'החודש הנבחר';
    return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1));
  }

  function formatMoney(cents) {
    const value = Number.isFinite(Number(cents)) ? Number(cents) : 0;
    return `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 }).format(value / 100)} ₪`;
  }

  function formatPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return '0%';
    return `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 }).format(numeric)}%`;
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('he-IL').format(date);
  }

  function asCents(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function safeText(value, fallback = 'ללא תיאור') {
    const text = String(value || '').trim();
    return text || fallback;
  }

  function sortRecentExpenses(expenses) {
    return [...expenses].sort((a, b) => {
      const first = `${b.expenseDate || ''}-${b.id || 0}`;
      const second = `${a.expenseDate || ''}-${a.id || 0}`;
      return first.localeCompare(second);
    });
  }

  function buildWhatsAppSummary(summary) {
    const data = summary || {};
    const lines = [`🏡 *תקציב הבית – ${monthName(data.month)}*`, ''];
    const budgetCents = asCents(data.budgetCents);
    const totalCents = asCents(data.totalCents);
    const remainingCents = budgetCents - totalCents;
    const expenses = sortRecentExpenses(Array.isArray(data.expenses) ? data.expenses : []);

    if (budgetCents > 0) {
      lines.push(`💰 *תקציב חודשי:* ${formatMoney(budgetCents)}`);
    } else {
      lines.push('💰 *תקציב חודשי:* עדיין לא הוגדר תקציב לחודש הזה');
    }
    lines.push(`💸 *סך ההוצאות:* ${formatMoney(totalCents)}`);
    if (budgetCents > 0 && remainingCents < 0) {
      lines.push(`⚠️ *חריגה של:* ${formatMoney(Math.abs(remainingCents))}`);
    } else if (budgetCents > 0) {
      lines.push(`✅ *נשאר:* ${formatMoney(remainingCents)}`);
    } else if (totalCents > 0) {
      lines.push('⚪ *יתרה/חריגה:* לא חושב כי אין תקציב מוגדר');
    } else {
      lines.push('✅ *יתרה/חריגה:* אין הוצאות ואין תקציב מוגדר');
    }
    lines.push(`📊 *ניצול התקציב:* ${budgetCents > 0 ? formatPercent((totalCents / budgetCents) * 100) : '0% (אין תקציב מוגדר)'}`);
    lines.push('');

    lines.push('👫 *מי שילם?*');
    for (const user of ['ido', 'karina']) {
      const payer = data.paidBy?.[user] || { amountCents: 0, count: 0 };
      const count = Number.isFinite(Number(payer.count)) ? Number(payer.count) : expenses.filter((expense) => expense.paidBy === user).length;
      lines.push(`• ${userName(user)} ${paidVerb(user)}: ${formatMoney(payer.amountCents)} — ${count} הוצאות`);
    }
    lines.push('');

    lines.push('🏷️ *לפי קטגוריות*');
    if (Array.isArray(data.byCategory) && data.byCategory.length) {
      const categories = [...data.byCategory].sort((a, b) => asCents(b.amountCents) - asCents(a.amountCents));
      for (const item of categories) {
        lines.push(`• ${safeText(item.category, 'אחר')}: ${formatMoney(item.amountCents)}`);
      }
    } else {
      lines.push('אין עדיין הוצאות בחודש הזה 🎉');
    }
    lines.push('');

    lines.push('🧾 *הוצאות אחרונות*');
    if (!expenses.length) {
      lines.push('אין עדיין הוצאות בחודש הזה 🎉');
    } else {
      for (const expense of expenses.slice(0, 10)) {
        const dateText = formatDate(expense.expenseDate);
        lines.push(`• ${safeText(expense.description)} — ${formatMoney(expense.amountCents)} | ${userName(expense.paidBy)}${dateText ? ` | ${dateText}` : ''}`);
      }
      if (expenses.length > 10) {
        lines.push(`ועוד ${expenses.length - 10} הוצאות באפליקציה`);
      }
    }
    lines.push('', '🔗 *כניסה לתקציב המשותף:*', APP_URL);

    return lines.join('\n');
  }

  function buildWhatsAppUrl(summary) {
    return `https://wa.me/?text=${encodeURIComponent(buildWhatsAppSummary(summary))}`;
  }

  const api = {
    APP_URL,
    buildWhatsAppSummary,
    buildWhatsAppUrl,
    formatMoney
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.HomeBudgetShare = api;
})(typeof window !== 'undefined' ? window : globalThis);
