const CATEGORIES = [
  'סופר',
  'שכירות',
  'חשמל',
  'מים',
  'ארנונה',
  'אינטרנט',
  'ריהוט וציוד',
  'ניקיון',
  'תחבורה',
  'בילויים',
  'אחר'
];

const CATEGORY_ALIASES = new Map([
  ['חשבונות', 'חשמל'],
  ['ציוד לדירה', 'ריהוט וציוד'],
  ['ריהוט', 'ריהוט וציוד']
]);

function parseAmountToCents(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 100);
  }

  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(',', '.').replace(/[₪,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

function formatMonth(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function parseQuickExpense(input, today = new Date()) {
  const text = String(input || '').trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, error: 'לא הוזן טקסט' };

  const amountMatch = text.match(/(?:^|\s)(\d+(?:[.,]\d{1,2})?)\s*(?:₪|שח|ש"ח)?(?:\s|$)/);
  if (!amountMatch) return { ok: false, error: 'לא נמצא סכום' };

  const amountCents = parseAmountToCents(amountMatch[1]);
  if (!amountCents || amountCents <= 0) return { ok: false, error: 'סכום לא תקין' };

  const before = text.slice(0, amountMatch.index).trim();
  const after = text.slice(amountMatch.index + amountMatch[0].length).trim();
  const label = [before, after].filter(Boolean).join(' ').trim();
  const description = label || 'הוצאה';
  const normalizedLabel = description.toLowerCase();
  const category =
    CATEGORIES.find((item) => item.toLowerCase() === normalizedLabel) ||
    CATEGORIES.find((item) => normalizedLabel.includes(item.toLowerCase())) ||
    CATEGORY_ALIASES.get(description) ||
    'אחר';

  return {
    ok: true,
    amountCents,
    category,
    description,
    expenseDate: today.toISOString().slice(0, 10)
  };
}

module.exports = {
  CATEGORIES,
  formatMonth,
  parseAmountToCents,
  parseQuickExpense
};
