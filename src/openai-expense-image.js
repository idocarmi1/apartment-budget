const { CATEGORIES } = require('./parser');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_VISION_MODEL = 'gpt-5.6-luna';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TRANSACTIONS = 12;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

let responsesFetchForTests = null;

function setOpenAIResponsesFetchForTests(fetchImpl) {
  responsesFetchForTests = fetchImpl;
}

function getOpenAIModel() {
  return process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL;
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    const error = new Error('סוג קובץ לא נתמך. אפשר להעלות PNG, JPEG או WebP בלבד.');
    error.statusCode = 400;
    throw error;
  }

  const mimeType = match[1];
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    const error = new Error('סוג קובץ לא נתמך. אפשר להעלות PNG, JPEG או WebP בלבד.');
    error.statusCode = 400;
    throw error;
  }

  const imageBytes = Buffer.byteLength(match[2], 'base64');
  if (imageBytes > MAX_IMAGE_BYTES) {
    const error = new Error('הצילום גדול מדי גם אחרי כיווץ. נסו לחתוך או להעלות צילום קטן יותר.');
    error.statusCode = 413;
    throw error;
  }

  return { mimeType, imageBytes };
}

function safeText(value, fallback = '') {
  return String(value || '').trim().slice(0, 140) || fallback;
}

function normalizeAmountToCents(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100);
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeCategory(value, categories = CATEGORIES) {
  const text = String(value || '').trim();
  return categories.includes(text) ? text : 'אחר';
}

function normalizeConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, Math.round(numeric * 100) / 100));
}

function normalizeTransaction(item, categories) {
  const amountCents = normalizeAmountToCents(item?.amount);
  const expenseDate = normalizeDate(item?.expenseDate);
  if (!amountCents || !expenseDate) return null;

  const merchant = safeText(item.merchant);
  const description = safeText(item.description, merchant || 'עסקה');
  return {
    amount: amountCents / 100,
    amountCents,
    description,
    merchant,
    expenseDate,
    category: normalizeCategory(item.category, categories),
    confidence: normalizeConfidence(item.confidence),
    warning: safeText(item.warning)
  };
}

function extractOutputText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  for (const item of response?.output || []) {
    for (const part of item?.content || []) {
      if (typeof part?.text === 'string') return part.text;
      if (typeof part?.output_text === 'string') return part.output_text;
    }
  }
  return '';
}

function buildJsonSchema(categories) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['transactions'],
    properties: {
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['amount', 'description', 'merchant', 'expenseDate', 'category', 'confidence', 'warning'],
          properties: {
            amount: { type: 'number' },
            description: { type: 'string' },
            merchant: { type: 'string' },
            expenseDate: { type: 'string' },
            category: { type: 'string', enum: categories },
            confidence: { type: 'number' },
            warning: { type: 'string' }
          }
        }
      }
    }
  };
}

function buildOpenAIRequest({ imageDataUrl, categories, model }) {
  return {
    model,
    input: [
      {
        role: 'developer',
        content: [
          {
            type: 'input_text',
            text: [
              'אתה מחלץ עסקאות מצילום מסך של ארנק דיגיטלי, בנק או חברת אשראי.',
              'החזר רק עסקאות חיוב/הוצאה אמיתיות. אל תכלול יתרות, מסגרות, מספרי כרטיס, פרטים אישיים או כותרות.',
              `הקטגוריה חייבת להיות אחת מהרשימה: ${categories.join(', ')}.`,
              `החזר לכל היותר ${MAX_TRANSACTIONS} עסקאות.`,
              'אם פרט לא ברור, בחר ערך סביר ושם הסבר קצר בשדה warning.'
            ].join('\n')
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'זהה עסקאות מהצילום והחזר JSON מובנה בלבד.'
          },
          {
            type: 'input_image',
            image_url: imageDataUrl,
            detail: 'high'
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'expense_image_transactions',
        strict: true,
        schema: buildJsonSchema(categories)
      }
    }
  };
}

async function parseExpenseImage({ imageDataUrl, categories = CATEGORIES }) {
  parseDataUrl(imageDataUrl);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('מפתח OpenAI לא מוגדר');
    error.statusCode = 503;
    throw error;
  }

  const model = getOpenAIModel();
  const requestBody = buildOpenAIRequest({ imageDataUrl, categories, model });
  const fetchImpl = responsesFetchForTests || globalThis.fetch;
  if (!fetchImpl) throw new Error('fetch לא זמין בסביבת השרת');

  const response = await fetchImpl(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = new Error(response.status === 401 ? 'מפתח OpenAI לא תקין' : 'תקלה זמנית בפענוח הצילום');
    error.statusCode = response.status === 401 ? 503 : 502;
    throw error;
  }

  let parsed;
  try {
    const payload = await response.json();
    const text = extractOutputText(payload);
    parsed = JSON.parse(text || '{}');
  } catch (error) {
    return { transactions: [], model, warning: 'צילום לא ברור או תשובה לא תקינה מהפענוח' };
  }

  const transactions = Array.isArray(parsed.transactions)
    ? parsed.transactions
      .slice(0, MAX_TRANSACTIONS)
      .map((item) => normalizeTransaction(item, categories))
      .filter(Boolean)
    : [];

  return { transactions, model };
}

module.exports = {
  DEFAULT_VISION_MODEL,
  MAX_IMAGE_BYTES,
  MAX_TRANSACTIONS,
  OPENAI_RESPONSES_URL,
  parseDataUrl,
  parseExpenseImage,
  setOpenAIResponsesFetchForTests
};
