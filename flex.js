'use strict';

// ==================== FLEX MODULE STATE ====================
let flexCurrentTab = 'dashboard';
let flexBillEditingId = null;
let flexBillsCache = [];

// ==================== INIT ====================
function loadFlexModule() {
  setupFlexReportDates();
  setupFlexFormDates();
  switchFlexTab(flexCurrentTab);
  populateFlexClientDropdown();
}

function setupFlexFormDates() {
  const today = new Date().toISOString().slice(0, 10);
  const bd = document.getElementById('fx-bill-date');
  const ed = document.getElementById('fx-exp-date');
  const rd = document.getElementById('fx-rep-date');
  if (bd && !bd.value) bd.value = today;
  if (ed && !ed.value) ed.value = today;
  if (rd && !rd.value) rd.value = today;
}

function setupFlexReportDates() {
  const yearSel = document.getElementById('fx-rep-year');
  if (!yearSel) return;
  if (yearSel.options.length === 0) {
    const cur = new Date().getFullYear();
    for (let y = cur; y >= cur - 4; y--) {
      const o = document.createElement('option');
      o.value = y; o.textContent = y;
      yearSel.appendChild(o);
    }
    yearSel.value = cur;
  }
  const monthSel = document.getElementById('fx-rep-month');
  if (monthSel) monthSel.value = String(new Date().getMonth() + 1).padStart(2, '0');
}

// ==================== TAB SWITCHING ====================
function switchFlexTab(tab) {
  flexCurrentTab = tab;
  document.querySelectorAll('.fx-tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.style.background = active ? 'rgba(255,255,255,.2)' : 'transparent';
    btn.style.color = active ? '#fff' : 'rgba(255,255,255,.7)';
    btn.style.borderBottom = active ? '3px solid #fff' : '3px solid transparent';
    btn.style.fontWeight = active ? '700' : '600';
  });
  document.querySelectorAll('.flex-tab-content').forEach(el => el.style.display = 'none');
  const tabEl = document.getElementById('flex-tab-' + tab);
  if (tabEl) tabEl.style.display = 'block';

  if (tab === 'dashboard') { loadFlexStats(); loadFlexDashboard(); }
  else if (tab === 'bills') { loadFlexStats(); loadFlexBills(); }
  else if (tab === 'expenses') { loadFlexExpenses(); }
  else if (tab === 'reports') { setupFlexReportDates(); setupFlexFormDates(); populateFlexClientDropdown(); }
}

// ==================== STATS BAR ====================
async function loadFlexStats() {
  try {
    const s = await window.shopAPI.getFlexStats();
    const el = id => document.getElementById(id);
    if (el('fx-today-bills'))   el('fx-today-bills').textContent  = s.today.bills;
    if (el('fx-today-rev'))     el('fx-today-rev').textContent    = fxCurrency(s.today.revenue);
    if (el('fx-month-rev'))     el('fx-month-rev').textContent    = fxCurrency(s.month.revenue);
    if (el('fx-month-bills'))   el('fx-month-bills').textContent  = `${s.month.bills} bills`;
    if (el('fx-outstanding'))   el('fx-outstanding').textContent  = fxCurrency(s.outstanding);
    if (el('fx-month-exp'))     el('fx-month-exp').textContent    = fxCurrency(s.monthExpenses);
  } catch (e) { console.warn('Flex stats error:', e); }
}

// ==================== DASHBOARD ====================
async function loadFlexDashboard() {
  const tbody = document.getElementById('fx-recent-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="loading-state"><div class="loading-spinner"></div>Loading...</td></tr>';
  try {
    const s = await window.shopAPI.getFlexStats();
    const rows = s.recentBills || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94A3B8;font-size:13px;">No bills found</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr style="border-bottom:1px solid #F0FDFA;">
        <td style="padding:9px 10px;font-size:12px;color:#64748B;">${fxDate(r.bill_date)}</td>
        <td style="padding:9px 10px;font-size:12px;font-weight:600;color:#0D9488;">${escFx(r.bill_no)}</td>
        <td style="padding:9px 10px;font-size:13px;font-weight:600;">${escFx(r.client_name)}</td>
        <td style="padding:9px 10px;font-size:12px;color:#64748B;">${escFx(r.description || '—')}</td>
        <td style="padding:9px 10px;text-align:right;font-size:13px;font-weight:600;">Rs. ${Math.round(r.total_amount).toLocaleString('en-PK')}</td>
        <td style="padding:9px 10px;text-align:right;font-size:12px;color:#059669;">Rs. ${Math.round(r.paid_amount).toLocaleString('en-PK')}</td>
        <td style="padding:9px 10px;text-align:right;font-size:12px;font-weight:700;color:${r.balance > 0 ? '#D97706' : '#059669'};">Rs. ${Math.round(r.balance).toLocaleString('en-PK')}</td>
        <td style="padding:9px 10px;text-align:center;">${fxStatusBadge(r.status)}</td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:#DC2626;">Error: ${e.message}</td></tr>`;
  }
}

// ==================== BILLS ====================
function calcFlexBillTotal() {
  const w    = parseFloat(document.getElementById('fx-bill-w')?.value) || 0;
  const h    = parseFloat(document.getElementById('fx-bill-h')?.value) || 0;
  const rate = parseFloat(document.getElementById('fx-bill-rate')?.value) || 0;
  const qty  = parseInt(document.getElementById('fx-bill-qty')?.value) || 1;
  const sqftEl = document.getElementById('fx-bill-sqft');
  const totalEl = document.getElementById('fx-bill-total');
  let sqft = parseFloat(sqftEl?.value) || 0;
  // Auto-fill sqft only if width and height are provided
  if (w > 0 && h > 0) { sqft = w * h; if (sqftEl) sqftEl.value = sqft.toFixed(2); }
  if (rate > 0 && sqft > 0 && totalEl) totalEl.value = Math.round(sqft * rate * qty);
}

async function saveFlexBill() {
  const bill_date    = document.getElementById('fx-bill-date')?.value?.trim();
  const client_name  = document.getElementById('fx-bill-client')?.value?.trim();
  const client_phone = document.getElementById('fx-bill-phone')?.value?.trim() || '';
  const description  = document.getElementById('fx-bill-desc')?.value?.trim() || '';
  const width_ft     = parseFloat(document.getElementById('fx-bill-w')?.value) || 0;
  const height_ft    = parseFloat(document.getElementById('fx-bill-h')?.value) || 0;
  const sq_ft        = parseFloat(document.getElementById('fx-bill-sqft')?.value) || (width_ft * height_ft);
  const rate_per_sqft= parseFloat(document.getElementById('fx-bill-rate')?.value) || 0;
  const quantity     = parseInt(document.getElementById('fx-bill-qty')?.value) || 1;
  const total_amount = parseFloat(document.getElementById('fx-bill-total')?.value) || 0;
  const paid_amount  = parseFloat(document.getElementById('fx-bill-paid')?.value) || 0;
  const payment_method = document.getElementById('fx-bill-method')?.value || 'cash';
  const notes        = document.getElementById('fx-bill-notes')?.value || '';

  if (!client_name) { fxToast('Client name zaroori hai!', 'error'); return; }
  if (total_amount <= 0) { fxToast('Total amount daalen!', 'error'); return; }

  try {
    if (flexBillEditingId) {
      await window.shopAPI.updateFlexBill({ id: flexBillEditingId, bill_date, client_name, client_phone, description, width_ft, height_ft, sq_ft, rate_per_sqft, quantity, total_amount, notes });
      fxToast('Bill update ho gaya!', 'success');
    } else {
      const res = await window.shopAPI.saveFlexBill({ bill_date, client_name, client_phone, description, width_ft, height_ft, sq_ft, rate_per_sqft, quantity, total_amount, paid_amount, payment_method, notes });
      fxToast(`Bill save ho gaya! ${res.bill_no}`, 'success');
    }
    resetFlexBillForm();
    await loadFlexStats();
    await loadFlexBills();
    populateFlexClientDropdown(); // refresh client list in reports dropdown
  } catch (e) { fxToast('Error: ' + e.message, 'error'); }
}

function resetFlexBillForm() {
  flexBillEditingId = null;
  const today = new Date().toISOString().slice(0, 10);
  const ids = ['fx-bill-client','fx-bill-phone','fx-bill-desc','fx-bill-w','fx-bill-h','fx-bill-sqft','fx-bill-rate','fx-bill-total','fx-bill-paid','fx-bill-notes'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const dateEl = document.getElementById('fx-bill-date'); if (dateEl) dateEl.value = today;
  const qtyEl  = document.getElementById('fx-bill-qty');  if (qtyEl)  qtyEl.value  = 1;
  const methodEl = document.getElementById('fx-bill-method'); if (methodEl) methodEl.value = 'cash';
  document.getElementById('fx-bill-form-title').textContent = 'New Flex Bill';
  const cancelBtn = document.getElementById('fx-bill-cancel-btn');
  const saveBtn   = document.getElementById('fx-bill-save-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (saveBtn)   saveBtn.textContent = 'Save Bill';
}

function cancelFlexBillEdit() { resetFlexBillForm(); fxToast('Edit cancel ho gaya.', 'info'); }

function editFlexBill(id) {
  const row = flexBillsCache.find(r => Number(r.id) === Number(id));
  if (!row) { fxToast('Bill not found.', 'error'); return; }
  flexBillEditingId = Number(id);
  document.getElementById('fx-bill-date').value   = row.bill_date || '';
  document.getElementById('fx-bill-client').value = row.client_name || '';
  document.getElementById('fx-bill-phone').value  = row.client_phone || '';
  document.getElementById('fx-bill-desc').value   = row.description || '';
  document.getElementById('fx-bill-w').value      = row.width_ft || '';
  document.getElementById('fx-bill-h').value      = row.height_ft || '';
  document.getElementById('fx-bill-sqft').value   = row.sq_ft || '';
  document.getElementById('fx-bill-rate').value   = row.rate_per_sqft || '';
  document.getElementById('fx-bill-qty').value    = row.quantity || 1;
  document.getElementById('fx-bill-total').value  = row.total_amount || '';
  document.getElementById('fx-bill-notes').value  = row.notes || '';
  document.getElementById('fx-bill-form-title').textContent = `Edit Bill: ${row.bill_no}`;
  const cancelBtn = document.getElementById('fx-bill-cancel-btn');
  const saveBtn   = document.getElementById('fx-bill-save-btn');
  if (cancelBtn) cancelBtn.style.display = 'inline-block';
  if (saveBtn)   saveBtn.textContent = 'Update Bill';
  document.getElementById('fx-bill-client')?.focus();
  fxToast('Edit mode. Changes save karein.', 'info');
}

function deleteFlexBill(id) {
  showConfirm('This bill and all its payment records will be permanently deleted.', async () => {
    try {
      await window.shopAPI.deleteFlexBill(id);
      fxToast('Bill deleted successfully.', 'success');
      if (flexBillEditingId === Number(id)) resetFlexBillForm();
      await loadFlexStats();
      await loadFlexBills();
    } catch (e) { fxToast('Delete error: ' + e.message, 'error'); }
  });
}

async function loadFlexBills() {
  const tbody = document.getElementById('fx-bills-tbody');
  if (!tbody) return;
  const dateFrom = document.getElementById('fx-filter-from')?.value || '';
  const dateTo   = document.getElementById('fx-filter-to')?.value   || '';
  const status   = document.getElementById('fx-filter-status')?.value || '';
  const search   = document.getElementById('fx-filter-search')?.value || '';
  tbody.innerHTML = '<tr><td colspan="10" class="loading-state"><div class="loading-spinner"></div>Loading...</td></tr>';
  try {
    const rows = await window.shopAPI.getFlexBills({ dateFrom, dateTo, status, search });
    flexBillsCache = Array.isArray(rows) ? rows : [];
    if (!flexBillsCache.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:28px;color:#94A3B8;font-size:13px;">No bills found</td></tr>';
    } else {
      tbody.innerHTML = flexBillsCache.map(r => `
        <tr style="border-bottom:1px solid #F0FDFA;">
          <td style="padding:8px 10px;font-size:12px;color:#64748B;">${fxDate(r.bill_date)}</td>
          <td style="padding:8px 10px;font-size:12px;font-weight:600;color:#0D9488;">${escFx(r.bill_no)}</td>
          <td style="padding:8px 10px;font-size:13px;font-weight:600;">${escFx(r.client_name)}<br><span style="font-size:11px;color:#94A3B8;">${escFx(r.client_phone||'')}</span></td>
          <td style="padding:8px 10px;font-size:12px;color:#64748B;max-width:140px;">${escFx(r.description||'—')}</td>
          <td style="padding:8px 10px;text-align:center;font-size:12px;">${r.sq_ft > 0 ? r.sq_ft.toFixed(1)+' ft²' : '—'}</td>
          <td style="padding:8px 10px;text-align:right;font-size:13px;font-weight:700;">Rs. ${Math.round(r.total_amount).toLocaleString('en-PK')}</td>
          <td style="padding:8px 10px;text-align:right;font-size:12px;color:#059669;">Rs. ${Math.round(r.paid_amount).toLocaleString('en-PK')}</td>
          <td style="padding:8px 10px;text-align:right;font-size:13px;font-weight:700;background:${r.balance>0?'#FFFBEB':'#F0FDF4'};color:${r.balance>0?'#D97706':'#059669'};">Rs. ${Math.round(r.balance).toLocaleString('en-PK')}</td>
          <td style="padding:8px 10px;text-align:center;">${fxStatusBadge(r.status)}</td>
          <td style="padding:8px 10px;text-align:center;white-space:nowrap;">
            ${r.status !== 'paid' ? `<button onclick="openFxPaymentModal(${r.id},'${escFx(r.bill_no)}','${escFx(r.client_name)}',${r.balance})" title="Add Payment" style="background:#0D9488;color:#fff;border:none;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;margin-right:3px;">+ Pay</button>` : ''}
            <button onclick="editFlexBill(${r.id})" title="Edit" style="background:#3B82F6;color:#fff;border:none;width:26px;height:26px;border-radius:4px;cursor:pointer;font-size:12px;margin-right:3px;">✏</button>
            <button onclick="deleteFlexBill(${r.id})" title="Delete" style="background:#DC2626;color:#fff;border:none;width:26px;height:26px;border-radius:4px;cursor:pointer;font-size:12px;">✕</button>
          </td>
        </tr>`).join('');
    }
    // Footer summary
    const totalRev = flexBillsCache.reduce((s,r) => s + (r.total_amount||0), 0);
    const totalBal = flexBillsCache.reduce((s,r) => s + (r.balance||0), 0);
    const cntEl = document.getElementById('fx-bills-count');
    const revEl = document.getElementById('fx-bills-revenue');
    const balEl = document.getElementById('fx-bills-balance');
    if (cntEl) cntEl.textContent = flexBillsCache.length;
    if (revEl) revEl.textContent = fxCurrency(totalRev);
    if (balEl) balEl.textContent = fxCurrency(totalBal);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:20px;color:#DC2626;">Error: ${e.message}</td></tr>`;
  }
}

function clearFlexBillFilters() {
  ['fx-filter-from','fx-filter-to','fx-filter-search'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const sel = document.getElementById('fx-filter-status'); if (sel) sel.value = '';
  loadFlexBills();
}

// ==================== PAYMENT MODAL ====================
function openFxPaymentModal(billId, billNo, clientName, balance) {
  document.getElementById('fx-pay-bill-id').value  = billId;
  document.getElementById('fx-pay-date').value     = new Date().toISOString().slice(0, 10);
  document.getElementById('fx-pay-amount').value   = Math.round(balance) || '';
  document.getElementById('fx-pay-method').value   = 'cash';
  document.getElementById('fx-pay-notes').value    = '';
  document.getElementById('fx-pay-modal-info').textContent = `${billNo} — ${clientName} | Balance: Rs. ${Math.round(balance).toLocaleString('en-PK')}`;
  loadFxPaymentHistory(billId);
  const modal = document.getElementById('fx-payment-modal');
  modal.style.display = 'flex';
}

function closeFxPaymentModal() {
  document.getElementById('fx-payment-modal').style.display = 'none';
}

async function loadFxPaymentHistory(billId) {
  const container = document.getElementById('fx-pay-history');
  if (!container) return;
  try {
    const pays = await window.shopAPI.getFlexPayments(billId);
    if (!pays || !pays.length) {
      container.innerHTML = '<div style="padding:10px;text-align:center;color:#94A3B8;font-size:11px;">No payment records</div>';
      return;
    }
    container.innerHTML = `<div style="padding:6px 10px;background:#F0FDFA;border-bottom:1px solid #E2E8F0;font-size:10px;font-weight:700;color:#0D9488;text-transform:uppercase;">Payment History</div>` +
      pays.map(p => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid #F1F5F9;font-size:12px;">
        <span style="color:#64748B;">${fxDate(p.payment_date)} · ${p.payment_method}</span>
        <span style="font-weight:600;color:#059669;">Rs. ${Math.round(p.amount).toLocaleString('en-PK')}</span>
        <button onclick="deleteFxPayment(${p.id},${p.flex_bill_id})" style="background:#FEE2E2;color:#DC2626;border:none;padding:2px 7px;border-radius:3px;font-size:10px;cursor:pointer;">Del</button>
      </div>`).join('');
  } catch (e) { container.innerHTML = ''; }
}

async function submitFlexPayment() {
  const flex_bill_id   = Number(document.getElementById('fx-pay-bill-id')?.value);
  const payment_date   = document.getElementById('fx-pay-date')?.value?.trim();
  const amount         = parseFloat(document.getElementById('fx-pay-amount')?.value) || 0;
  const payment_method = document.getElementById('fx-pay-method')?.value || 'cash';
  const notes          = document.getElementById('fx-pay-notes')?.value || '';
  if (!flex_bill_id) { fxToast('Bill ID not found.', 'error'); return; }
  if (amount <= 0)   { fxToast('Amount daalen!', 'error'); return; }
  try {
    await window.shopAPI.addFlexPayment({ flex_bill_id, payment_date, amount, payment_method, notes });
    fxToast(`Payment Rs. ${Math.round(amount).toLocaleString('en-PK')} save ho gaya!`, 'success');
    closeFxPaymentModal();
    await loadFlexStats();
    await loadFlexBills();
  } catch (e) { fxToast('Payment error: ' + e.message, 'error'); }
}

function deleteFxPayment(payId, billId) {
  showConfirm('This payment record will be permanently deleted.', async () => {
    try {
      await window.shopAPI.deleteFlexPayment(payId);
      fxToast('Payment deleted successfully.', 'success');
      await loadFxPaymentHistory(billId);
      await loadFlexStats();
      await loadFlexBills();
    } catch (e) { fxToast('Error: ' + e.message, 'error'); }
  });
}

// ==================== EXPENSES ====================
async function saveFlexExpense() {
  const expense_date = document.getElementById('fx-exp-date')?.value?.trim();
  const description  = document.getElementById('fx-exp-desc')?.value?.trim();
  const amount       = parseFloat(document.getElementById('fx-exp-amount')?.value) || 0;
  const notes        = document.getElementById('fx-exp-notes')?.value || '';
  if (!description) { fxToast('Description zaroori hai!', 'error'); return; }
  if (amount <= 0)  { fxToast('Amount daalen!', 'error'); return; }
  try {
    await window.shopAPI.saveFlexExpense({ expense_date, description, amount, notes });
    fxToast('Expense save ho gaya!', 'success');
    document.getElementById('fx-exp-desc').value   = '';
    document.getElementById('fx-exp-amount').value = '';
    document.getElementById('fx-exp-notes').value  = '';
    await loadFlexExpenses();
    loadFlexStats();
  } catch (e) { fxToast('Error: ' + e.message, 'error'); }
}

async function loadFlexExpenses() {
  const tbody = document.getElementById('fx-expenses-tbody');
  if (!tbody) return;
  const dateFrom = document.getElementById('fx-exp-from')?.value || '';
  const dateTo   = document.getElementById('fx-exp-to')?.value   || '';
  tbody.innerHTML = '<tr><td colspan="5" class="loading-state"><div class="loading-spinner"></div>Loading...</td></tr>';
  try {
    const rows = await window.shopAPI.getFlexExpenses({ dateFrom, dateTo });
    if (!rows || !rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:#94A3B8;">No expenses found</td></tr>';
      document.getElementById('fx-exp-total').textContent = 'Rs. 0';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr style="border-bottom:1px solid #FEF2F2;">
        <td style="padding:8px 10px;font-size:12px;color:#64748B;">${fxDate(r.expense_date)}</td>
        <td style="padding:8px 10px;font-size:13px;font-weight:600;">${escFx(r.description)}</td>
        <td style="padding:8px 10px;text-align:right;font-size:13px;font-weight:700;color:#DC2626;">Rs. ${Math.round(r.amount).toLocaleString('en-PK')}</td>
        <td style="padding:8px 10px;font-size:12px;color:#94A3B8;">${escFx(r.notes||'—')}</td>
        <td style="padding:8px 10px;text-align:center;"><button onclick="deleteFlexExpense(${r.id})" style="background:#FEE2E2;color:#DC2626;border:none;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;">Delete</button></td>
      </tr>`).join('');
    const total = rows.reduce((s,r) => s + (r.amount||0), 0);
    document.getElementById('fx-exp-total').textContent = fxCurrency(total);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#DC2626;padding:20px;">Error: ${e.message}</td></tr>`;
  }
}

function deleteFlexExpense(id) {
  showConfirm('This expense entry will be permanently deleted.', async () => {
    try {
      await window.shopAPI.deleteFlexExpense(id);
      fxToast('Expense deleted successfully.', 'success');
      await loadFlexExpenses();
      loadFlexStats();
    } catch (e) { fxToast('Error: ' + e.message, 'error'); }
  });
}

// ==================== REPORTS ====================
async function populateFlexClientDropdown() {
  const sel = document.getElementById('fx-rep-client');
  if (!sel) return;
  const prev = sel.value;
  try {
    // derive unique clients from bills — avoids separate IPC dependency
    const bills = await window.shopAPI.getFlexBills({});
    const clients = [...new Set((bills || []).map(b => (b.client_name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    sel.innerHTML = `<option value="">— All Clients —</option>` +
      clients.map(c => `<option value="${escFx(c)}">${escFx(c)}</option>`).join('');
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  } catch (e) {
    console.error('populateFlexClientDropdown error:', e);
    sel.innerHTML = `<option value="">— All Clients —</option>`;
  }
}

async function generateFlexMonthlyPDF() {
  const month = document.getElementById('fx-rep-month')?.value;
  const clientName = (document.getElementById('fx-rep-client')?.value || '').trim();
  const year   = document.getElementById('fx-rep-year')?.value;
  if (!month || !year) { fxToast('Please select month and year!', 'warning'); return; }
  try {
    const data = await window.shopAPI.getFlexMonthlyReport({ year: parseInt(year), month: parseInt(month), clientName: clientName || null });
    const { bills = [], expenses = [], summary = {}, expTotal = 0, ym = '' } = data;
    const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
    const title = `Flex Module — ${monthNames[parseInt(month)]} ${year}${clientName ? ' — ' + clientName : ''}`;

    const billsHtml = !bills.length
      ? '<tr><td colspan="8" style="text-align:center;padding:12px;color:#999;">No bills this month</td></tr>'
      : bills.map((r,i) => `<tr>
          <td style="padding:7px 8px;border:1px solid #99F6E4;">${i+1}</td>
          <td style="padding:7px 8px;border:1px solid #99F6E4;">${fxDate(r.bill_date)}</td>
          <td style="padding:7px 8px;border:1px solid #99F6E4;">${r.bill_no}</td>
          <td style="padding:7px 8px;border:1px solid #99F6E4;">${r.client_name}</td>
          <td style="padding:7px 8px;border:1px solid #99F6E4;">${r.description||'—'}</td>
          <td style="padding:7px 8px;border:1px solid #99F6E4;text-align:right;">Rs. ${Math.round(r.total_amount).toLocaleString('en-PK')}</td>
          <td style="padding:7px 8px;border:1px solid #99F6E4;text-align:right;color:#059669;">Rs. ${Math.round(r.paid_amount).toLocaleString('en-PK')}</td>
          <td style="padding:7px 8px;border:1px solid #99F6E4;text-align:right;color:${r.balance>0?'#D97706':'#059669'};">${fxStatusBadge(r.status)}<br>Rs. ${Math.round(r.balance).toLocaleString('en-PK')}</td>
        </tr>`).join('');

    const expensesSection = clientName ? '' : (() => {
      const expHtml = !expenses.length
        ? '<tr><td colspan="4" style="text-align:center;padding:12px;color:#999;">No expenses this month</td></tr>'
        : expenses.map(r => `<tr>
            <td style="padding:7px 8px;border:1px solid #FECACA;">${fxDate(r.expense_date)}</td>
            <td style="padding:7px 8px;border:1px solid #FECACA;">${r.description}</td>
            <td style="padding:7px 8px;border:1px solid #FECACA;text-align:right;color:#DC2626;">Rs. ${Math.round(r.amount).toLocaleString('en-PK')}</td>
            <td style="padding:7px 8px;border:1px solid #FECACA;">${r.notes||'—'}</td>
          </tr>`).join('');
      return `
        <h2 style="color:#DC2626;border-bottom-color:#DC2626;">Expenses (${expenses.length})</h2>
        <table><thead><tr style="background:#FEF2F2;">
          <th style="border:1px solid #FECACA;">Date</th><th style="border:1px solid #FECACA;">Description</th>
          <th style="border:1px solid #FECACA;text-align:right;">Amount</th><th style="border:1px solid #FECACA;">Notes</th>
        </tr></thead><tbody>${expHtml}</tbody>
        <tfoot><tr style="background:#FEF2F2;font-weight:700;">
          <td colspan="2" style="padding:8px;border:1px solid #FECACA;text-align:right;color:#DC2626;">Total Expenses:</td>
          <td style="padding:8px;border:1px solid #FECACA;text-align:right;color:#DC2626;">Rs. ${Math.round(expTotal).toLocaleString('en-PK')}</td>
          <td style="border:1px solid #FECACA;"></td>
        </tr></tfoot></table>`;
    })();

    const net = (summary.total_revenue || 0) - expTotal;
    const netSection = clientName ? '' : `
      <div style="text-align:center;padding:18px;border-radius:8px;margin-top:16px;border:2px solid ${net>=0?'#0D9488':'#DC2626'};background:${net>=0?'#F0FDFA':'#FEF2F2'};">
        <div style="font-size:13px;color:#64748B;margin-bottom:6px;">${net>=0?'Net Profit':'Net Loss'}</div>
        <div style="font-size:28px;font-weight:800;color:${net>=0?'#0D9488':'#DC2626'};">Rs. ${Math.round(Math.abs(net)).toLocaleString('en-PK')}</div>
        <div style="font-size:11px;color:#94A3B8;margin-top:4px;">Revenue Rs. ${Math.round(summary.total_revenue||0).toLocaleString('en-PK')} − Expenses Rs. ${Math.round(expTotal).toLocaleString('en-PK')}</div>
      </div>`;

    const summaryCards = clientName
      ? `<div class="s-card" style="background:#0D9488;color:#fff;"><div class="label">Total Bills</div><div class="value">${summary.total_bills||0}</div></div>
         <div class="s-card" style="background:#0891B2;color:#fff;"><div class="label">Total Revenue</div><div class="value">Rs. ${Math.round(summary.total_revenue||0).toLocaleString('en-PK')}</div></div>
         <div class="s-card" style="background:#059669;color:#fff;"><div class="label">Total Collected</div><div class="value">Rs. ${Math.round(summary.total_paid||0).toLocaleString('en-PK')}</div></div>
         <div class="s-card" style="background:#D97706;color:#fff;"><div class="label">Outstanding</div><div class="value">Rs. ${Math.round(summary.total_balance||0).toLocaleString('en-PK')}</div></div>`
      : `<div class="s-card" style="background:#0D9488;color:#fff;"><div class="label">Total Bills</div><div class="value">${summary.total_bills||0}</div></div>
         <div class="s-card" style="background:#0891B2;color:#fff;"><div class="label">Total Revenue</div><div class="value">Rs. ${Math.round(summary.total_revenue||0).toLocaleString('en-PK')}</div></div>
         <div class="s-card" style="background:#059669;color:#fff;"><div class="label">Total Collected</div><div class="value">Rs. ${Math.round(summary.total_paid||0).toLocaleString('en-PK')}</div></div>
         <div class="s-card" style="background:#D97706;color:#fff;"><div class="label">Outstanding</div><div class="value">Rs. ${Math.round(summary.total_balance||0).toLocaleString('en-PK')}</div></div>
         <div class="s-card" style="background:#DC2626;color:#fff;"><div class="label">Expenses</div><div class="value">Rs. ${Math.round(expTotal).toLocaleString('en-PK')}</div></div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{font-family:Arial,sans-serif;padding:36px;color:#1a1a1a;font-size:13px;}
      h1{text-align:center;color:#0D9488;margin-bottom:4px;font-size:20px;}
      .subtitle{text-align:center;color:#64748B;font-size:13px;margin-bottom:24px;}
      .summary{display:flex;gap:16px;margin-bottom:24px;}
      .s-card{flex:1;padding:14px;border-radius:8px;text-align:center;}
      .label{font-size:11px;margin-bottom:4px;opacity:.8;}
      .value{font-size:18px;font-weight:800;}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;}
      th{padding:8px;text-align:left;font-weight:700;font-size:11px;}
      h2{font-size:14px;margin:20px 0 10px;border-bottom:2px solid #0D9488;padding-bottom:6px;color:#0D9488;}
    </style></head><body>
    <h1>Naeem Hassan Flex Printer</h1>
    <div class="subtitle">${title}</div>
    <div class="summary">${summaryCards}</div>
    <h2>Bills (${bills.length})</h2>
    <table><thead><tr style="background:#F0FDFA;">
      <th style="border:1px solid #99F6E4;">#</th><th style="border:1px solid #99F6E4;">Date</th><th style="border:1px solid #99F6E4;">Bill #</th>
      <th style="border:1px solid #99F6E4;">Client</th><th style="border:1px solid #99F6E4;">Description</th>
      <th style="border:1px solid #99F6E4;text-align:right;">Total</th><th style="border:1px solid #99F6E4;text-align:right;">Paid</th>
      <th style="border:1px solid #99F6E4;text-align:right;">Balance/Status</th>
    </tr></thead><tbody>${billsHtml}</tbody>
    <tfoot><tr style="background:#F0FDFA;font-weight:700;">
      <td colspan="5" style="padding:8px;border:1px solid #99F6E4;text-align:right;color:#0D9488;">Total:</td>
      <td style="padding:8px;border:1px solid #99F6E4;text-align:right;">Rs. ${Math.round(summary.total_revenue||0).toLocaleString('en-PK')}</td>
      <td style="padding:8px;border:1px solid #99F6E4;text-align:right;color:#059669;">Rs. ${Math.round(summary.total_paid||0).toLocaleString('en-PK')}</td>
      <td style="padding:8px;border:1px solid #99F6E4;text-align:right;color:#D97706;">Rs. ${Math.round(summary.total_balance||0).toLocaleString('en-PK')}</td>
    </tr></tfoot></table>
    ${expensesSection}
    ${netSection}
    </body></html>`;

    const safeClient = clientName ? '_' + clientName.replace(/[^a-zA-Z0-9]/g, '_') : '';
    const result = await window.shopAPI.savePDF({ htmlContent: html, filename: `Flex_Monthly_${ym}${safeClient}.pdf`, subfolder: 'Abdullah Shop - Flex Reports' });
    fxToast(`✓ PDF saved! ${result?.path || ''}`, 'success');
  } catch (e) { fxToast('PDF error: ' + e.message, 'error'); }
}

async function generateFlexRangePDF() {
  const singleDate = document.getElementById('fx-rep-date')?.value?.trim();
  const rangeFrom  = document.getElementById('fx-rep-range-from')?.value?.trim();
  const rangeTo    = document.getElementById('fx-rep-range-to')?.value?.trim();
  const dateFrom   = singleDate || rangeFrom;
  const dateTo     = singleDate || rangeTo;
  if (!dateFrom) { fxToast('Tarikh choose karein!', 'warning'); return; }
  try {
    const [bills, expenses] = await Promise.all([
      window.shopAPI.getFlexBills({ dateFrom, dateTo: dateTo || dateFrom }),
      window.shopAPI.getFlexExpenses({ dateFrom, dateTo: dateTo || dateFrom })
    ]);
    if (!bills.length && !expenses.length) { fxToast('No data found for this period.', 'info'); return; }
    const totalRev = bills.reduce((s,r) => s+(r.total_amount||0), 0);
    const totalPaid = bills.reduce((s,r) => s+(r.paid_amount||0), 0);
    const totalBal  = bills.reduce((s,r) => s+(r.balance||0), 0);
    const totalExp  = expenses.reduce((s,r) => s+(r.amount||0), 0);
    const net = totalRev - totalExp;
    const rangeLabel = dateFrom === dateTo ? fxDate(dateFrom) : `${fxDate(dateFrom)} to ${fxDate(dateTo)}`;

    const billsHtml = !bills.length ? '<tr><td colspan="7" style="text-align:center;padding:12px;color:#999;">No bills</td></tr>'
      : bills.map((r,i) => `<tr><td style="padding:7px 8px;border:1px solid #99F6E4;">${i+1}</td><td style="padding:7px 8px;border:1px solid #99F6E4;">${fxDate(r.bill_date)}</td><td style="padding:7px 8px;border:1px solid #99F6E4;">${r.bill_no}</td><td style="padding:7px 8px;border:1px solid #99F6E4;">${r.client_name}</td><td style="padding:7px 8px;border:1px solid #99F6E4;">${r.description||'—'}</td><td style="padding:7px 8px;border:1px solid #99F6E4;text-align:right;">Rs. ${Math.round(r.total_amount).toLocaleString('en-PK')}</td><td style="padding:7px 8px;border:1px solid #99F6E4;text-align:right;">${fxStatusBadge(r.status)}</td></tr>`).join('');
    const expHtml = !expenses.length ? '<tr><td colspan="3" style="text-align:center;padding:12px;color:#999;">No expenses</td></tr>'
      : expenses.map(r => `<tr><td style="padding:7px 8px;border:1px solid #FECACA;">${fxDate(r.expense_date)}</td><td style="padding:7px 8px;border:1px solid #FECACA;">${r.description}</td><td style="padding:7px 8px;border:1px solid #FECACA;text-align:right;color:#DC2626;">Rs. ${Math.round(r.amount).toLocaleString('en-PK')}</td></tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;padding:36px;color:#1a1a1a;font-size:13px;}h1{text-align:center;color:#0D9488;margin-bottom:4px;font-size:18px;}.subtitle{text-align:center;color:#64748B;font-size:13px;margin-bottom:20px;}table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px;}th{padding:7px 8px;font-weight:700;font-size:11px;}h2{font-size:14px;margin:16px 0 8px;border-bottom:2px solid #0D9488;padding-bottom:5px;color:#0D9488;}.net{text-align:center;padding:16px;border-radius:8px;border:2px solid ${net>=0?'#0D9488':'#DC2626'};background:${net>=0?'#F0FDFA':'#FEF2F2'};margin-top:14px;}</style></head><body>
    <h1>Abdullah Shop — Flex Module</h1>
    <div class="subtitle">${rangeLabel}</div>
    <div style="display:flex;gap:12px;margin-bottom:18px;">
      <div style="flex:1;background:#0D9488;color:#fff;padding:12px;border-radius:6px;text-align:center;"><div style="font-size:10px;opacity:.8;margin-bottom:3px;">Bills</div><div style="font-size:16px;font-weight:800;">${bills.length}</div></div>
      <div style="flex:1;background:#0891B2;color:#fff;padding:12px;border-radius:6px;text-align:center;"><div style="font-size:10px;opacity:.8;margin-bottom:3px;">Revenue</div><div style="font-size:16px;font-weight:800;">Rs. ${Math.round(totalRev).toLocaleString('en-PK')}</div></div>
      <div style="flex:1;background:#059669;color:#fff;padding:12px;border-radius:6px;text-align:center;"><div style="font-size:10px;opacity:.8;margin-bottom:3px;">Collected</div><div style="font-size:16px;font-weight:800;">Rs. ${Math.round(totalPaid).toLocaleString('en-PK')}</div></div>
      <div style="flex:1;background:#D97706;color:#fff;padding:12px;border-radius:6px;text-align:center;"><div style="font-size:10px;opacity:.8;margin-bottom:3px;">Outstanding</div><div style="font-size:16px;font-weight:800;">Rs. ${Math.round(totalBal).toLocaleString('en-PK')}</div></div>
      <div style="flex:1;background:#DC2626;color:#fff;padding:12px;border-radius:6px;text-align:center;"><div style="font-size:10px;opacity:.8;margin-bottom:3px;">Expenses</div><div style="font-size:16px;font-weight:800;">Rs. ${Math.round(totalExp).toLocaleString('en-PK')}</div></div>
    </div>
    <h2>Bills</h2>
    <table><thead><tr style="background:#F0FDFA;"><th style="border:1px solid #99F6E4;">#</th><th style="border:1px solid #99F6E4;">Date</th><th style="border:1px solid #99F6E4;">Bill #</th><th style="border:1px solid #99F6E4;">Client</th><th style="border:1px solid #99F6E4;">Description</th><th style="border:1px solid #99F6E4;text-align:right;">Total</th><th style="border:1px solid #99F6E4;text-align:center;">Status</th></tr></thead><tbody>${billsHtml}</tbody></table>
    <h2 style="color:#DC2626;border-bottom-color:#DC2626;">Expenses</h2>
    <table><thead><tr style="background:#FEF2F2;"><th style="border:1px solid #FECACA;">Date</th><th style="border:1px solid #FECACA;">Description</th><th style="border:1px solid #FECACA;text-align:right;">Amount</th></tr></thead><tbody>${expHtml}</tbody></table>
    <div class="net"><div style="font-size:12px;color:#64748B;margin-bottom:5px;">${net>=0?'Net Profit':'Net Loss'}</div><div style="font-size:26px;font-weight:800;color:${net>=0?'#0D9488':'#DC2626'};">Rs. ${Math.round(Math.abs(net)).toLocaleString('en-PK')}</div><div style="font-size:11px;color:#94A3B8;margin-top:4px;">Revenue Rs. ${Math.round(totalRev).toLocaleString('en-PK')} − Expenses Rs. ${Math.round(totalExp).toLocaleString('en-PK')}</div></div>
    </body></html>`;

    const fname = dateFrom === dateTo ? `Flex_Daily_${dateFrom}.pdf` : `Flex_Range_${dateFrom}_to_${dateTo}.pdf`;
    const result = await window.shopAPI.savePDF({ htmlContent: html, filename: fname, subfolder: 'Abdullah Shop - Flex Reports' });
    fxToast(`✓ PDF saved! ${result?.path || ''}`, 'success');
  } catch (e) { fxToast('PDF error: ' + e.message, 'error'); }
}

// ==================== HELPERS ====================
function fxCurrency(amount) {
  return `Rs. ${Math.round(parseFloat(amount)||0).toLocaleString('en-PK')}`;
}

function fxDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

function fxStatusBadge(status) {
  const map = {
    paid:    { bg:'#DCFCE7', color:'#059669', label:'Paid' },
    partial: { bg:'#FEF3C7', color:'#D97706', label:'Partial' },
    pending: { bg:'#FEE2E2', color:'#DC2626', label:'Pending' }
  };
  const s = map[status] || map.pending;
  return `<span style="background:${s.bg};color:${s.color};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;">${s.label}</span>`;
}

function escFx(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fxToast(msg, type = 'info') {
  if (typeof showToast === 'function') { showToast(msg, type); return; }
  console.log(`[Flex ${type}]`, msg);
}
