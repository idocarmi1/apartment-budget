(function attachShareMessage(root) {
  const APP_URL = 'https://apartment-budget.vercel.app';
  const EMOJI = Object.freeze({
    HOME: String.fromCodePoint(0x1F3E1),
    MONEY: String.fromCodePoint(0x1F4B0),
    EXPENSES: String.fromCodePoint(0x1F4B8),
    SUCCESS: String.fromCodePoint(0x2705),
    WARNING: String.fromCodePoint(0x26A0, 0xFE0F),
    NO_BUDGET: String.fromCodePoint(0x26AA),
    CHART: String.fromCodePoint(0x1F4CA),
    COUPLE: String.fromCodePoint(0x1F46B),
    CATEGORIES: String.fromCodePoint(0x1F3F7, 0xFE0F),
    RECEIPT: String.fromCodePoint(0x1F9FE),
    PARTY: String.fromCodePoint(0x1F389),
    LINK: String.fromCodePoint(0x1F517)
  });

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
    const lines = [`${EMOJI.HOME} *תקציב הבית – ${monthName(data.month)}*`, ''];
    const budgetCents = asCents(data.budgetCents);
    const totalCents = asCents(data.totalCents);
    const remainingCents = budgetCents - totalCents;
    const expenses = sortRecentExpenses(Array.isArray(data.expenses) ? data.expenses : []);

    if (budgetCents > 0) {
      lines.push(`${EMOJI.MONEY} *תקציב חודשי:* ${formatMoney(budgetCents)}`);
    } else {
      lines.push(`${EMOJI.MONEY} *תקציב חודשי:* עדיין לא הוגדר תקציב לחודש הזה`);
    }
    lines.push(`${EMOJI.EXPENSES} *סך ההוצאות:* ${formatMoney(totalCents)}`);
    if (budgetCents > 0 && remainingCents < 0) {
      lines.push(`${EMOJI.WARNING} *חריגה של:* ${formatMoney(Math.abs(remainingCents))}`);
    } else if (budgetCents > 0) {
      lines.push(`${EMOJI.SUCCESS} *נשאר:* ${formatMoney(remainingCents)}`);
    } else if (totalCents > 0) {
      lines.push(`${EMOJI.NO_BUDGET} *יתרה/חריגה:* לא חושב כי אין תקציב מוגדר`);
    } else {
      lines.push(`${EMOJI.SUCCESS} *יתרה/חריגה:* אין הוצאות ואין תקציב מוגדר`);
    }
    lines.push(`${EMOJI.CHART} *ניצול התקציב:* ${budgetCents > 0 ? formatPercent((totalCents / budgetCents) * 100) : '0% (אין תקציב מוגדר)'}`);
    lines.push('');

    lines.push(`${EMOJI.COUPLE} *מי שילם?*`);
    for (const user of ['ido', 'karina']) {
      const payer = data.paidBy?.[user] || { amountCents: 0, count: 0 };
      const count = Number.isFinite(Number(payer.count)) ? Number(payer.count) : expenses.filter((expense) => expense.paidBy === user).length;
      lines.push(`• ${userName(user)} ${paidVerb(user)}: ${formatMoney(payer.amountCents)} — ${count} הוצאות`);
    }
    lines.push('');

    lines.push(`${EMOJI.CATEGORIES} *לפי קטגוריות*`);
    if (Array.isArray(data.byCategory) && data.byCategory.length) {
      const categories = [...data.byCategory].sort((a, b) => asCents(b.amountCents) - asCents(a.amountCents));
      for (const item of categories) {
        lines.push(`• ${safeText(item.category, 'אחר')}: ${formatMoney(item.amountCents)}`);
      }
    } else {
      lines.push(`אין עדיין הוצאות בחודש הזה ${EMOJI.PARTY}`);
    }
    lines.push('');

    lines.push(`${EMOJI.RECEIPT} *הוצאות אחרונות*`);
    if (!expenses.length) {
      lines.push(`אין עדיין הוצאות בחודש הזה ${EMOJI.PARTY}`);
    } else {
      for (const expense of expenses.slice(0, 10)) {
        const dateText = formatDate(expense.expenseDate);
        lines.push(`• ${safeText(expense.description)} — ${formatMoney(expense.amountCents)} | ${userName(expense.paidBy)}${dateText ? ` | ${dateText}` : ''}`);
      }
      if (expenses.length > 10) {
        lines.push(`ועוד ${expenses.length - 10} הוצאות באפליקציה`);
      }
    }
    lines.push('', `${EMOJI.LINK} *כניסה לתקציב המשותף:*`, APP_URL);

    return lines.join('\n');
  }

  function buildWhatsAppUrl(summary) {
    const url = new URL('https://wa.me/');
    url.searchParams.set('text', buildWhatsAppSummary(summary));
    return url.toString();
  }

  const api = {
    APP_URL,
    EMOJI,
    buildWhatsAppSummary,
    buildWhatsAppUrl,
    formatMoney
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.HomeBudgetShare = api;
})(typeof window !== 'undefined' ? window : globalThis);
