const state = {
  session: null,
  categories: [],
  currentMonth: localMonth(),
  summary: null,
  pollTimer: null,
  loading: false,
  filters: {
    category: '',
    paidBy: '',
    q: ''
  }
};

const els = {
  loginView: document.querySelector('#loginView'),
  appView: document.querySelector('#appView'),
  loginForm: document.querySelector('#loginForm'),
  loginError: document.querySelector('#loginError'),
  logoutBtn: document.querySelector('#logoutBtn'),
  helloText: document.querySelector('#helloText'),
  syncStatus: document.querySelector('#syncStatus'),
  guideCard: document.querySelector('#guideCard'),
  dismissGuideBtn: document.querySelector('#dismissGuideBtn'),
  monthTitle: document.querySelector('#monthTitle'),
  prevMonthBtn: document.querySelector('#prevMonthBtn'),
  nextMonthBtn: document.querySelector('#nextMonthBtn'),
  todayBtn: document.querySelector('#todayBtn'),
  historyBtn: document.querySelector('#historyBtn'),
  closeHistoryBtn: document.querySelector('#closeHistoryBtn'),
  budgetAmount: document.querySelector('#budgetAmount'),
  totalAmount: document.querySelector('#totalAmount'),
  remainingAmount: document.querySelector('#remainingAmount'),
  remainingLabel: document.querySelector('#remainingLabel'),
  utilizationAmount: document.querySelector('#utilizationAmount'),
  remainingCard: document.querySelector('#remainingCard'),
  progressBar: document.querySelector('#progressBar'),
  budgetForm: document.querySelector('#budgetForm'),
  budgetInput: document.querySelector('#budgetInput'),
  budgetSubmitBtn: document.querySelector('#budgetSubmitBtn'),
  budgetHint: document.querySelector('#budgetHint'),
  budgetMessage: document.querySelector('#budgetMessage'),
  copyPreviousBudgetBtn: document.querySelector('#copyPreviousBudgetBtn'),
  quickForm: document.querySelector('#quickForm'),
  quickInput: document.querySelector('#quickInput'),
  quickSubmitBtn: document.querySelector('#quickSubmitBtn'),
  expenseForm: document.querySelector('#expenseForm'),
  expenseAmount: document.querySelector('#expenseAmount'),
  expenseCategory: document.querySelector('#expenseCategory'),
  expenseDescription: document.querySelector('#expenseDescription'),
  expensePaidBy: document.querySelector('#expensePaidBy'),
  expenseDate: document.querySelector('#expenseDate'),
  cancelExpenseBtn: document.querySelector('#cancelExpenseBtn'),
  manualExpenseBtn: document.querySelector('#manualExpenseBtn'),
  entryMessage: document.querySelector('#entryMessage'),
  categoryBreakdown: document.querySelector('#categoryBreakdown'),
  payerBreakdown: document.querySelector('#payerBreakdown'),
  undoBtn: document.querySelector('#undoBtn'),
  filtersForm: document.querySelector('#filtersForm'),
  categoryFilter: document.querySelector('#categoryFilter'),
  payerFilter: document.querySelector('#payerFilter'),
  searchInput: document.querySelector('#searchInput'),
  emptyState: document.querySelector('#emptyState'),
  expensesList: document.querySelector('#expensesList'),
  historyView: document.querySelector('#historyView'),
  historyList: document.querySelector('#historyList'),
  shareBtn: document.querySelector('#shareBtn'),
  copySummaryBtn: document.querySelector('#copySummaryBtn'),
  backupBtn: document.querySelector('#backupBtn'),
  restoreInput: document.querySelector('#restoreInput'),
  backupMessage: document.querySelector('#backupMessage'),
  expenseDialog: document.querySelector('#expenseDialog'),
  editExpenseForm: document.querySelector('#editExpenseForm'),
  editExpenseId: document.querySelector('#editExpenseId'),
  editAmount: document.querySelector('#editAmount'),
  editCategory: document.querySelector('#editCategory'),
  editDescription: document.querySelector('#editDescription'),
  editPaidBy: document.querySelector('#editPaidBy'),
  editDate: document.querySelector('#editDate'),
  toast: document.querySelector('#toast')
};

function localMonth(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addMonths(month, delta) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return localMonth(date);
}

function monthName(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1));
}

function formatMoney(cents) {
  return `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 }).format((cents || 0) / 100)} ₪`;
}

function centsFromInput(input) {
  return Math.round(Number(input.value || 0) * 100);
}

function setInputFromCents(input, cents) {
  input.value = cents ? (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2) : '';
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'שגיאת תקשורת');
  return data;
}

function apiUrl(action, params = {}) {
  const search = new URLSearchParams({ action });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  return `/api?${search.toString()}`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

function setMessage(element, text, isError = false) {
  element.textContent = text || '';
  element.style.color = isError ? 'var(--bad)' : 'var(--muted)';
  element.classList.toggle('error-text', Boolean(isError));
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function renderUserOptions() {
  const user = state.session?.user || 'ido';
  els.expensePaidBy.value = user;
}

function fillCategorySelect(select, includeAll = false) {
  select.innerHTML = '';
  if (includeAll) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'כל הקטגוריות';
    select.append(option);
  }
  for (const category of state.categories) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.append(option);
  }
}

async function init() {
  bindEvents();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  try {
    const session = await api(apiUrl('session'));
    if (session.authenticated) {
      state.session = session;
      await enterApp();
    } else {
      showLogin();
    }
  } catch (error) {
    showLogin();
    els.loginError.textContent = 'אין חיבור לשרת. בדקו שהאפליקציה רצה.';
  }
}

function showLogin() {
  els.loginView.classList.remove('hidden');
  els.appView.classList.add('hidden');
}

async function enterApp() {
  els.loginView.classList.add('hidden');
  els.appView.classList.remove('hidden');
  els.helloText.textContent = `היי ${state.session.name || userName(state.session.user)} 👋`;
  els.guideCard.classList.toggle('hidden', localStorage.getItem('homeBudgetGuideDismissed') === 'true');
  const categoriesResponse = await api(apiUrl('categories'));
  state.categories = categoriesResponse.categories;
  fillCategorySelect(els.expenseCategory);
  fillCategorySelect(els.editCategory);
  fillCategorySelect(els.categoryFilter, true);
  renderUserOptions();
  await loadSummary();
  startPolling();
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible' || isUserEnteringData()) return;
    loadSummary({ quiet: true });
    if (!els.historyView.classList.contains('hidden')) loadHistory();
  }, 4000);
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function isUserEnteringData() {
  const active = document.activeElement;
  if (!active) return false;
  const typing = active.matches('input, textarea, select');
  const inEntryArea = active.closest('.entry-panel') || active.closest('.budget-panel') || active.closest('dialog');
  return Boolean(typing && inEntryArea);
}

function setSync(ok, text) {
  els.syncStatus.textContent = ok ? `🟢 ${text}` : `🔴 ${text}`;
  els.syncStatus.classList.toggle('offline', !ok);
}

async function loadSummary(options = {}) {
  if (state.loading) return;
  state.loading = true;
  if (!options.quiet) setSync(true, 'טוען');
  try {
    const params = new URLSearchParams({ month: state.currentMonth });
    if (state.filters.category) params.set('category', state.filters.category);
    if (state.filters.paidBy) params.set('paidBy', state.filters.paidBy);
    if (state.filters.q) params.set('q', state.filters.q);
    state.summary = await api(apiUrl('summary', Object.fromEntries(params)));
    renderSummary();
    setSync(true, options.quiet ? 'מסונכרן אוטומטית' : 'מסונכרן');
  } catch (error) {
    setSync(false, 'אין חיבור לשרת');
    if (!options.quiet) showToast(error.message);
  } finally {
    state.loading = false;
  }
}

function renderSummary() {
  const summary = state.summary;
  els.monthTitle.textContent = monthName(summary.month);
  els.budgetAmount.textContent = formatMoney(summary.budgetCents);
  els.totalAmount.textContent = formatMoney(summary.totalCents);
  const overBudget = summary.remainingCents < 0;
  els.remainingLabel.textContent = overBudget ? '⚠️ חריגה' : '✅ נשאר';
  els.remainingAmount.textContent = formatMoney(Math.abs(summary.remainingCents));
  const utilization = Number.isFinite(Number(summary.utilization)) ? summary.utilization : 0;
  els.utilizationAmount.textContent = `${utilization}%`;
  if (document.activeElement !== els.budgetInput) setInputFromCents(els.budgetInput, summary.budgetCents);
  els.budgetHint.textContent = summary.budgetCents > 0
    ? `התקציב לחודש הזה הוא ${formatMoney(summary.budgetCents)}`
    : 'עדיין לא הגדרתם תקציב לחודש הזה';
  const status = overBudget ? 'bad' : utilization >= 85 ? 'warn' : 'ok';
  els.remainingCard.className = `metric ${status}`;
  els.progressBar.className = `progress-bar ${status}`;
  els.progressBar.style.width = `${Math.min(utilization, 100)}%`;
  els.copyPreviousBudgetBtn.classList.toggle('hidden', summary.budgetCents > 0);
  renderBreakdowns();
  renderExpenses();
}

function renderBreakdowns() {
  const maxCategory = Math.max(1, ...state.summary.byCategory.map((item) => item.amountCents));
  els.categoryBreakdown.innerHTML = '';
  if (!state.summary.byCategory.length) {
    els.categoryBreakdown.innerHTML = '<div class="empty">אין עדיין פירוט קטגוריות.</div>';
  } else {
    for (const item of state.summary.byCategory) {
      const row = document.createElement('div');
      row.className = 'breakdown-row';
      row.innerHTML = `
        <strong>${escapeHtml(item.category)}</strong>
        <span>${formatMoney(item.amountCents)}</span>
        <div class="breakdown-track"><span style="width:${Math.round((item.amountCents / maxCategory) * 100)}%"></span></div>
      `;
      els.categoryBreakdown.append(row);
    }
  }

  els.payerBreakdown.innerHTML = '';
  for (const user of ['ido', 'karina']) {
    const item = state.summary.paidBy[user];
    const card = document.createElement('div');
    card.className = `payer-card ${user}`;
    card.innerHTML = `<span>${item.name}</span><strong>${formatMoney(item.amountCents)}</strong><small>${item.count} הוצאות</small>`;
    els.payerBreakdown.append(card);
  }
}

function renderExpenses() {
  els.expensesList.innerHTML = '';
  els.emptyState.classList.toggle('hidden', state.summary.expenses.length > 0);
  for (const expense of state.summary.expenses) {
    const item = document.createElement('article');
    item.className = 'expense-item';
    item.innerHTML = `
      <div class="expense-main">
        <div>
          <strong>${escapeHtml(expense.description)}</strong>
          <div class="meta">
            <span>${escapeHtml(expense.category)}</span>
            <span>${userName(expense.paidBy)} שילם</span>
            <span>נוצר על ידי ${userName(expense.createdBy)}</span>
            <span>${formatDate(expense.expenseDate)}</span>
          </div>
        </div>
        <strong>${formatMoney(expense.amountCents)}</strong>
      </div>
      <div class="expense-actions">
        <button type="button" data-action="edit" data-id="${expense.id}">עריכה</button>
        <button class="ghost" type="button" data-action="delete" data-id="${expense.id}">מחיקה</button>
      </div>
    `;
    els.expensesList.append(item);
  }
}

function userName(user) {
  return user === 'karina' ? 'קארינה' : 'עידו';
}

function formatDate(value) {
  return new Intl.DateTimeFormat('he-IL').format(new Date(`${value}T12:00:00`));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function fillExpenseForm(parsed) {
  setInputFromCents(els.expenseAmount, parsed.amountCents);
  els.expenseCategory.value = parsed.category || 'אחר';
  els.expenseDescription.value = parsed.description || '';
  els.expensePaidBy.value = parsed.paidBy || state.session.user;
  els.expenseDate.value = parsed.expenseDate || localDate();
  els.expenseForm.classList.remove('hidden');
}

async function loadHistory() {
  const response = await api(apiUrl('history'));
  els.historyList.innerHTML = '';
  if (!response.months.length) {
    els.historyList.innerHTML = '<div class="empty">אין עדיין חודשים להצגה.</div>';
    return;
  }
  for (const item of response.months) {
    const row = document.createElement('article');
    row.className = 'history-item';
    const balanceLabel = item.remainingCents >= 0 ? 'נשאר' : 'חריגה';
    row.innerHTML = `
      <strong>${monthName(item.month)}</strong>
      <div class="meta">
        <span>תקציב ${formatMoney(item.budgetCents)}</span>
        <span>הוצאות ${formatMoney(item.totalCents)}</span>
        <span>${balanceLabel} ${formatMoney(Math.abs(item.remainingCents))}</span>
        <span>${item.expenseCount} הוצאות</span>
        <span>עידו ${formatMoney(item.paidBy.ido.amountCents)}</span>
        <span>קארינה ${formatMoney(item.paidBy.karina.amountCents)}</span>
      </div>
      <button type="button" data-month="${item.month}">פתיחת החודש</button>
    `;
    els.historyList.append(row);
  }
}

async function getUnfilteredCurrentSummary() {
  return api(apiUrl('summary', { month: state.currentMonth }));
}

function buildSummaryText(summary = state.summary) {
  return window.HomeBudgetShare.buildWhatsAppSummary(summary);
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
  showToast('הסיכום הועתק');
}

function bindEvents() {
  els.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    els.loginError.textContent = '';
    const form = new FormData(els.loginForm);
    try {
      state.session = await api(apiUrl('login'), {
        method: 'POST',
        body: JSON.stringify({ user: form.get('user'), pin: form.get('pin') })
      });
      await enterApp();
    } catch (error) {
      els.loginError.textContent = error.message;
    }
  });

  els.logoutBtn.addEventListener('click', async () => {
    await api(apiUrl('logout'), { method: 'POST' });
    stopPolling();
    showLogin();
  });

  els.dismissGuideBtn.addEventListener('click', () => {
    localStorage.setItem('homeBudgetGuideDismissed', 'true');
    els.guideCard.classList.add('hidden');
  });

  els.prevMonthBtn.addEventListener('click', () => changeMonth(-1));
  els.nextMonthBtn.addEventListener('click', () => changeMonth(1));
  els.todayBtn.addEventListener('click', () => {
    state.currentMonth = localMonth();
    loadSummary();
  });

  els.historyBtn.addEventListener('click', async () => {
    els.historyView.classList.remove('hidden');
    await loadHistory();
    els.historyView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  els.closeHistoryBtn.addEventListener('click', () => els.historyView.classList.add('hidden'));

  els.historyList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-month]');
    if (!button) return;
    state.currentMonth = button.dataset.month;
    els.historyView.classList.add('hidden');
    await loadSummary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  els.budgetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(els.budgetSubmitBtn, true);
    setMessage(els.budgetMessage, '');
    try {
      await api(apiUrl('budget', { month: state.currentMonth }), {
        method: 'PUT',
        body: JSON.stringify({ month: state.currentMonth, amountCents: centsFromInput(els.budgetInput) })
      });
      setMessage(els.budgetMessage, 'התקציב נשמר ומתעדכן אצל שניכם.');
      showToast('התקציב נשמר');
      await loadSummary();
    } catch (error) {
      setMessage(els.budgetMessage, error.message, true);
    } finally {
      setBusy(els.budgetSubmitBtn, false);
    }
  });

  els.copyPreviousBudgetBtn.addEventListener('click', async () => {
    const previousMonth = addMonths(state.currentMonth, -1);
    const previous = await api(apiUrl('summary', { month: previousMonth }));
    if (!previous.budgetCents) {
      showToast('לא נמצא תקציב בחודש הקודם');
      return;
    }
    if (!confirm(`להעתיק תקציב של ${formatMoney(previous.budgetCents)} מ${monthName(previousMonth)}?`)) return;
    await api(apiUrl('budget', { month: state.currentMonth }), {
      method: 'PUT',
      body: JSON.stringify({ month: state.currentMonth, amountCents: previous.budgetCents })
    });
    await loadSummary();
  });

  els.quickForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(els.entryMessage, '');
    setBusy(els.quickSubmitBtn, true);
    try {
      const parsed = await api(apiUrl('parse', { text: els.quickInput.value }));
      if (!parsed.ok) {
        fillExpenseForm({ paidBy: state.session.user, expenseDate: localDate(), category: 'אחר' });
        setMessage(els.entryMessage, parsed.error || 'לא הצלחתי לפענח, אפשר למלא ידנית.', true);
        return;
      }
      fillExpenseForm({ ...parsed, paidBy: state.session.user });
      setMessage(els.entryMessage, 'זיהיתי את הפרטים. אפשר לתקן ולאשר.');
    } catch (error) {
      setMessage(els.entryMessage, error.message, true);
    } finally {
      setBusy(els.quickSubmitBtn, false);
    }
  });

  els.manualExpenseBtn.addEventListener('click', () => {
    fillExpenseForm({ paidBy: state.session.user, expenseDate: localDate(), category: 'אחר' });
  });

  els.cancelExpenseBtn.addEventListener('click', () => {
    els.expenseForm.classList.add('hidden');
    setMessage(els.entryMessage, '');
  });

  els.expenseForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(els.expenseForm.querySelector('button[type="submit"]'), true);
    try {
      await api(apiUrl('expenses'), {
        method: 'POST',
        body: JSON.stringify(readExpenseForm())
      });
      els.quickInput.value = '';
      els.expenseForm.reset();
      els.expenseForm.classList.add('hidden');
      setMessage(els.entryMessage, 'ההוצאה נשמרה ומופיעה אצל שניכם.');
      await loadSummary();
    } catch (error) {
      setMessage(els.entryMessage, error.message, true);
    } finally {
      setBusy(els.expenseForm.querySelector('button[type="submit"]'), false);
    }
  });

  els.filtersForm.addEventListener('input', () => {
    state.filters.category = els.categoryFilter.value;
    state.filters.paidBy = els.payerFilter.value;
    state.filters.q = els.searchInput.value.trim();
    loadSummary();
  });

  els.undoBtn.addEventListener('click', async () => {
    if (!confirm('למחוק את ההוצאה האחרונה שהוספת?')) return;
    const response = await api(apiUrl('undo-last'), { method: 'POST' });
    showToast(response.deleted ? 'ההוצאה האחרונה נמחקה' : 'אין הוצאה אחרונה למחיקה');
    await loadSummary();
  });

  els.expensesList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    const expense = state.summary.expenses.find((item) => item.id === id);
    if (!expense) return;
    if (button.dataset.action === 'edit') openEditDialog(expense);
    if (button.dataset.action === 'delete') await deleteExpense(expense);
  });

  els.editExpenseForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.currentMonth !== localMonth() && !confirm('זו הוצאה מחודש קודם. לשמור את העריכה?')) return;
    await api(apiUrl('expense', { id: els.editExpenseId.value }), {
      method: 'PUT',
      body: JSON.stringify({
        amountCents: centsFromInput(els.editAmount),
        category: els.editCategory.value,
        description: els.editDescription.value.trim(),
        paidBy: els.editPaidBy.value,
        expenseDate: els.editDate.value
      })
    });
    els.expenseDialog.close();
    showToast('ההוצאה עודכנה');
    await loadSummary();
  });

  els.shareBtn.addEventListener('click', async () => {
    setBusy(els.shareBtn, true);
    try {
      const summary = await getUnfilteredCurrentSummary();
      const url = window.HomeBudgetShare.buildWhatsAppUrl(summary);
      const opened = window.open(url, '_blank', 'noopener');
      if (!opened) {
        await copyText(window.HomeBudgetShare.buildWhatsAppSummary(summary));
        showToast('הסיכום הועתק. אפשר להדביק אותו ב־WhatsApp.');
      }
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(els.shareBtn, false);
    }
  });

  els.copySummaryBtn.addEventListener('click', async () => {
    setBusy(els.copySummaryBtn, true);
    try {
      await copyText(buildSummaryText(await getUnfilteredCurrentSummary()));
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(els.copySummaryBtn, false);
    }
  });

  els.backupBtn.addEventListener('click', async () => {
    const backup = await api(apiUrl('backup'));
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `home-budget-${localDate()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage(els.backupMessage, 'קובץ הגיבוי נוצר.');
  });

  els.restoreInput.addEventListener('change', async () => {
    const file = els.restoreInput.files[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (!confirm('שחזור יחליף את הנתונים הקיימים. להמשיך?')) return;
      if (!confirm('אישור נוסף: לשחזר את קובץ הגיבוי עכשיו?')) return;
      await api(apiUrl('restore'), { method: 'POST', body: JSON.stringify(backup) });
      setMessage(els.backupMessage, 'השחזור הושלם וסונכרן.');
      await loadSummary();
    } catch (error) {
      setMessage(els.backupMessage, error.message, true);
    } finally {
      els.restoreInput.value = '';
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.session && !isUserEnteringData()) loadSummary({ quiet: true });
  });

  window.addEventListener('focus', () => {
    if (state.session && !isUserEnteringData()) loadSummary({ quiet: true });
  });
}

function changeMonth(delta) {
  state.currentMonth = addMonths(state.currentMonth, delta);
  loadSummary();
}

function readExpenseForm() {
  return {
    amountCents: centsFromInput(els.expenseAmount),
    category: els.expenseCategory.value,
    description: els.expenseDescription.value.trim(),
    paidBy: els.expensePaidBy.value,
    expenseDate: els.expenseDate.value
  };
}

function openEditDialog(expense) {
  els.editExpenseId.value = expense.id;
  setInputFromCents(els.editAmount, expense.amountCents);
  els.editCategory.value = expense.category;
  els.editDescription.value = expense.description;
  els.editPaidBy.value = expense.paidBy;
  els.editDate.value = expense.expenseDate;
  els.expenseDialog.showModal();
}

async function deleteExpense(expense) {
  const oldMonth = state.currentMonth !== localMonth();
  const message = oldMonth
    ? 'זו הוצאה מחודש קודם. למחוק אותה בכל זאת?'
    : `למחוק את "${expense.description}"?`;
  if (!confirm(message)) return;
  await api(apiUrl('expense', { id: expense.id }), { method: 'DELETE' });
  showToast('ההוצאה נמחקה');
  await loadSummary();
}

init();
