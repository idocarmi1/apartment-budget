const test = require('node:test');
const assert = require('node:assert/strict');
const share = require('../public/share-message');

function createFullSummary() {
  return {
    month: '2026-08',
    budgetCents: 600000,
    totalCents: 725000,
    paidBy: {
      ido: { amountCents: 325000, count: 6 },
      karina: { amountCents: 400000, count: 5 }
    },
    byCategory: [
      { category: 'חשמל', amountCents: 125000 },
      { category: 'סופר', amountCents: 600000 }
    ],
    expenses: createExpenses(11)
  };
}

function createExpenses(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    amountCents: (index + 1) * 1000,
    category: index % 2 ? 'חשמל' : 'סופר',
    description: `הוצאה ${index + 1}`,
    paidBy: index % 2 ? 'karina' : 'ido',
    createdBy: index % 3 ? 'ido' : 'karina',
    expenseDate: `2026-08-${String(index + 1).padStart(2, '0')}`
  }));
}

test('בונה הודעת WhatsApp עברית מלאה ללא ערכי NaN או undefined', () => {
  const text = share.buildWhatsAppSummary(createFullSummary());

  assert.match(text, /תקציב הבית/);
  assert.match(text, /אוגוסט 2026/);
  assert.match(text, /\*תקציב חודשי:\* 6,000 ₪/);
  assert.match(text, /\*סך ההוצאות:\* 7,250 ₪/);
  assert.match(text, /\*חריגה של:\* 1,250 ₪/);
  assert.match(text, /\*ניצול התקציב:\* 120\.8%/);
  assert.match(text, /עידו שילם: 3,250 ₪ — 6 הוצאות/);
  assert.match(text, /קארינה שילמה: 4,000 ₪ — 5 הוצאות/);
  assert.ok(text.indexOf('סופר') < text.indexOf('חשמל'));
  assert.match(text, /ועוד 1 הוצאות באפליקציה/);
  assert.match(text, /https:\/\/apartment-budget\.vercel\.app/);
  assert.match(text, /\n\n/);
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('הודעת WhatsApp מכילה אימוג׳ים תקינים בלי replacement character או mojibake', () => {
  const text = share.buildWhatsAppSummary(createFullSummary());

  for (const emoji of [
    share.EMOJI.HOME,
    share.EMOJI.MONEY,
    share.EMOJI.EXPENSES,
    share.EMOJI.WARNING,
    share.EMOJI.CHART,
    share.EMOJI.COUPLE,
    share.EMOJI.CATEGORIES,
    share.EMOJI.RECEIPT,
    share.EMOJI.LINK
  ]) {
    assert.ok(text.includes(emoji), `missing emoji ${emoji}`);
  }

  assert.doesNotMatch(text, /\uFFFD|�/);
  assert.doesNotMatch(text, /ðŸ|â/);
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('קידוד WhatsApp מתפענח פעם אחת בדיוק לטקסט המקורי', () => {
  const text = share.buildWhatsAppSummary(createFullSummary());
  const url = share.buildWhatsAppUrl(createFullSummary());
  const encodedMessage = url.slice('https://wa.me/?text='.length);

  assert.match(url, /^https:\/\/wa\.me\/\?text=/);
  assert.equal(decodeURIComponent(encodedMessage), text);
  assert.notEqual(encodedMessage, text);
  assert.match(text, /\*תקציב חודשי:\* 6,000 ₪/);
  assert.match(text, /\*סך ההוצאות:\* 7,250 ₪/);
  assert.match(text, /תקציב הבית/);
  assert.match(text, /\n/);
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('מטפל בחודש בלי תקציב ובלי הוצאות', () => {
  const text = share.buildWhatsAppSummary({
    month: '2026-09',
    expenses: [],
    paidBy: {}
  });

  assert.match(text, /עדיין לא הוגדר תקציב/);
  assert.match(text, /אין הוצאות ואין תקציב מוגדר/);
  assert.match(text, /0% \(אין תקציב מוגדר\)/);
  assert.match(text, /אין עדיין הוצאות בחודש הזה/);
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('מקודד URL של WhatsApp בלי מספר יעד קבוע', () => {
  const url = share.buildWhatsAppUrl({ month: '2026-08', expenses: [] });

  assert.match(url, /^https:\/\/wa\.me\/\?text=/);
  assert.doesNotMatch(url, /phone=/);
  assert.match(decodeURIComponent(url.slice('https://wa.me/?text='.length)), /תקציב הבית/);
});
