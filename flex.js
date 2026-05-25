'use strict';

// ==================== FLEX MODULE STATE ====================
let flexCurrentTab = 'dashboard';
let flexBillEditingId = null;
let flexBillsCache = [];
let flexRevenueChart = null;

// ==================== INIT ====================
function loadFlexModule() {
  showPage('flex-dashboard');
}

function loadFlexDashboardPage() {
  setupFlexReportDates();
  setupFlexFormDates();
  loadFlexDashboard();
}

function loadFlexBillsPage() {
  setupFlexFormDates();
  loadFlexStats();
  loadFlexBills();
}

function loadFlexExpensesPage() {
  setupFlexFormDates();
  loadFlexExpenses();
}

function loadFlexReportsPage() {
  setupFlexReportDates();
  setupFlexFormDates();
  populateFlexClientDropdown();
}

function loadFlexAccountsPage() {
  loadFlexAccounts();
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
  const pageByTab = {
    dashboard: 'flex-dashboard',
    bills: 'flex-bills',
    expenses: 'flex-expenses',
    reports: 'flex-reports'
  };
  if (pageByTab[tab]) { showPage(pageByTab[tab]); return; }
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
    applyFlexStats(s);
  } catch (e) { console.warn('Flex stats error:', e); }
}

function applyFlexStats(s = {}) {
  const el = id => document.getElementById(id);
  const today = s.today || {};
  const month = s.month || {};
  const expenses = s.expenses || {};

  if (el('fx-today-bills'))   el('fx-today-bills').textContent  = today.bills || 0;
  if (el('fx-today-rev'))     el('fx-today-rev').textContent    = fxCurrency(today.revenue || 0);
  if (el('fx-month-rev'))     el('fx-month-rev').textContent    = fxCurrency(month.revenue || 0);
  if (el('fx-month-bills'))   el('fx-month-bills').textContent  = `${month.bills || 0} bills`;
  if (el('fx-outstanding'))   el('fx-outstanding').textContent  = fxCurrency(s.outstanding || 0);
  if (el('fx-month-exp'))     el('fx-month-exp').textContent    = fxCurrency(s.monthExpenses || expenses.month?.exp || 0);

  if (el('fx-td-bills'))      el('fx-td-bills').textContent     = today.bills || 0;
  if (el('fx-td-rev'))        el('fx-td-rev').textContent       = fxCurrency(today.revenue || 0);
  if (el('fx-td-col'))        el('fx-td-col').textContent       = fxCurrency(today.paid || 0);
  if (el('fx-td-pen'))        el('fx-td-pen').textContent       = fxCurrency(today.pending || 0);
  if (el('fx-mo-bills'))      el('fx-mo-bills').textContent     = month.bills || 0;
  if (el('fx-mo-rev'))        el('fx-mo-rev').textContent       = fxCurrency(month.revenue || 0);
  if (el('fx-mo-col'))        el('fx-mo-col').textContent       = fxCurrency(month.paid || 0);
  if (el('fx-mo-pen'))        el('fx-mo-pen').textContent       = fxCurrency(month.pending || 0);
  if (el('fx-td-exp'))        el('fx-td-exp').textContent       = fxCurrency(expenses.today?.exp || 0);
  if (el('fx-td-exp-count'))  el('fx-td-exp-count').textContent = expenses.today?.cnt || 0;
  if (el('fx-mo-exp'))        el('fx-mo-exp').textContent       = fxCurrency(expenses.month?.exp || 0);
  if (el('fx-mo-exp-count'))  el('fx-mo-exp-count').textContent = expenses.month?.cnt || 0;
}

// ==================== DASHBOARD ====================
async function loadFlexDashboard() {
  const tbody = document.getElementById('fx-recent-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="loading-state"><div class="loading-spinner"></div>Loading...</td></tr>';
  try {
    const s = await window.shopAPI.getFlexStats();
    applyFlexStats(s);
    const dateLabel = document.getElementById('fx-dash-date-full');
    if (dateLabel) {
      dateLabel.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    renderFlexWorkTypes(s.workTypes || []);
    renderFlexExpenseDaily(s.expenses?.daily || []);
    renderFlexRevenueChart(s.last12 || []);
    const rows = s.recentBills || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#94A3B8;font-size:13px;">No flex bills found</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><span class="badge badge-blue">${escFx(r.bill_no)}</span></td>
        <td class="font-semibold">${escFx(r.client_name || 'Walk-in')}</td>
        <td class="font-bold">${fxCurrency(r.total_amount)}</td>
        <td class="text-success font-semibold">${fxCurrency(r.paid_amount)}</td>
        <td class="${r.balance > 0 ? 'text-danger font-bold' : 'text-success font-semibold'}">${fxCurrency(r.balance)}</td>
        <td>${fxStatusBadge(r.status)}</td>
        <td class="text-muted">${fxDate(r.bill_date)}</td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#DC2626;">Error: ${escFx(e.message)}</td></tr>`;
  }
}

function renderFlexWorkTypes(rows) {
  const el = document.getElementById('fx-cat-breakdown');
  if (!el) return;
  if (!rows || rows.length === 0) {
    el.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No flex bills recorded this month</p></div>';
    return;
  }
  const total = rows.reduce((sum, row) => sum + (parseFloat(row.revenue) || 0), 0);
  el.innerHTML = rows.map(row => {
    const pct = total > 0 ? (((parseFloat(row.revenue) || 0) / total) * 100).toFixed(1) : 0;
    return `<div class="cat-bar-item">
      <div class="cat-bar-top">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="badge badge-green">${escFx(row.category || 'Flex Work')}</span>
          <span class="text-sm text-muted">${row.cnt || 0} bills</span>
        </div>
        <span class="font-bold" style="font-size:13px;">${fxCurrency(row.revenue || 0)}</span>
      </div>
      <div class="cat-bar-track">
        <div class="cat-bar-fill" style="width:${pct}%;background:#0D9488;"></div>
      </div>
    </div>`;
  }).join('');
}

function renderFlexExpenseDaily(rows) {
  const tbody = document.getElementById('fx-exp-day-body');
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="no-data">No flex expense entries this month</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(row => `
    <tr>
      <td class="font-semibold">${fxDate(row.expense_date)}</td>
      <td><span class="badge badge-blue">${row.total_entries || 0}</span></td>
      <td class="text-danger font-semibold">${fxCurrency(row.total_amount || 0)}</td>
    </tr>
  `).join('');
}

function renderFlexRevenueChart(last12Rows) {
  const el = document.getElementById('fx-apex-revenue-chart');
  if (!el || typeof ApexCharts === 'undefined') return;
  const labels = [];
  const values = [];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const rows = Array.isArray(last12Rows) ? last12Rows : [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const found = rows.find(row => row.month === key);
    labels.push(monthNames[d.getMonth()]);
    values.push(found ? Math.round(found.revenue || 0) : 0);
  }
  if (flexRevenueChart) { flexRevenueChart.destroy(); flexRevenueChart = null; }
  flexRevenueChart = new ApexCharts(el, {
    chart: { type: 'bar', height: 280, toolbar: { show: false }, fontFamily: 'Inter, Segoe UI, sans-serif' },
    series: [{ name: 'Flex Revenue', data: values }],
    colors: ['#0D9488'],
    plotOptions: { bar: { borderRadius: 5, columnWidth: '45%' } },
    dataLabels: { enabled: false },
    xaxis: { categories: labels },
    yaxis: { labels: { formatter: value => 'Rs. ' + Math.round(value).toLocaleString('en-PK') } },
    grid: { borderColor: '#E2E8F0' },
    tooltip: { y: { formatter: value => fxCurrency(value) } }
  });
  flexRevenueChart.render();
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

  if (!client_name) { fxToast('Client name is required!', 'error'); return; }
  if (total_amount <= 0) { fxToast('Please enter a total amount!', 'error'); return; }

  try {
    if (flexBillEditingId) {
      await window.shopAPI.updateFlexBill({ id: flexBillEditingId, bill_date, client_name, client_phone, description, width_ft, height_ft, sq_ft, rate_per_sqft, quantity, total_amount, notes });
      fxToast('Bill updated successfully!', 'success');
    } else {
      const res = await window.shopAPI.saveFlexBill({ bill_date, client_name, client_phone, description, width_ft, height_ft, sq_ft, rate_per_sqft, quantity, total_amount, paid_amount, payment_method, notes });
      fxToast(`Bill saved successfully! ${res.bill_no}`, 'success');
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

function cancelFlexBillEdit() { resetFlexBillForm(); fxToast('Edit cancelled.', 'info'); }

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
  fxToast('Edit mode enabled. Save your changes when ready.', 'info');
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
  if (amount <= 0)   { fxToast('Please enter an amount!', 'error'); return; }
  try {
    await window.shopAPI.addFlexPayment({ flex_bill_id, payment_date, amount, payment_method, notes });
    fxToast(`Payment Rs. ${Math.round(amount).toLocaleString('en-PK')} saved successfully!`, 'success');
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
  if (!description) { fxToast('Description is required!', 'error'); return; }
  if (amount <= 0)  { fxToast('Please enter an amount!', 'error'); return; }
  try {
    await window.shopAPI.saveFlexExpense({ expense_date, description, amount, notes });
    fxToast('Expense saved successfully!', 'success');
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

// ==================== ACCOUNTS ====================
async function loadFlexAccounts() {
  const tbody = document.getElementById('fx-accounts-tbody');
  if (!tbody) return;
  const params = {
    dateFrom: document.getElementById('fx-acc-from')?.value || '',
    dateTo: document.getElementById('fx-acc-to')?.value || '',
    entryType: document.getElementById('fx-acc-type')?.value || '',
    paymentMethod: document.getElementById('fx-acc-method')?.value || '',
    search: document.getElementById('fx-acc-search')?.value || ''
  };
  tbody.innerHTML = '<tr><td colspan="6" class="loading-state"><div class="loading-spinner"></div>Loading...</td></tr>';
  try {
    const data = await getFlexAccountData(params);
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const summary = data?.summary || {};
    const methods = data?.methods || {};

    setFlexText('fx-acc-income', fxCurrency(summary.total_income || 0));
    setFlexText('fx-acc-expense', fxCurrency(summary.total_expense || 0));
    setFlexText('fx-acc-net', fxCurrency(summary.net_balance || 0));
    setFlexText('fx-acc-outstanding', fxCurrency(summary.outstanding || 0));
    setFlexText('fx-method-cash', fxCurrency(methods.cash || 0));
    setFlexText('fx-method-jazzcash', fxCurrency(methods.jazzcash || 0));
    setFlexText('fx-method-easypaisa', fxCurrency(methods.easypaisa || 0));
    setFlexText('fx-method-bank-account', fxCurrency(methods.bank_account || 0));

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94A3B8;">No flex account entries found</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr style="border-bottom:1px solid #F0FDFA;">
        <td style="padding:9px 10px;font-size:12px;color:#64748B;">${fxDate(r.txn_date)}</td>
        <td style="padding:9px 10px;">${fxAccountTypeBadge(r.entry_type)}</td>
        <td style="padding:9px 10px;font-weight:600;">${escFx(r.title || '')}<br><span style="font-size:11px;color:#94A3B8;">${escFx(r.description || '')}</span></td>
        <td style="padding:9px 10px;font-size:12px;color:#64748B;">${fxPaymentMethodLabel(r.payment_method)}</td>
        <td style="padding:9px 10px;text-align:right;font-weight:800;color:${r.entry_type === 'expense' ? '#DC2626' : '#059669'};">${fxCurrency(r.amount || 0)}</td>
        <td style="padding:9px 10px;font-size:12px;color:#94A3B8;">${escFx(r.notes || '—')}</td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#DC2626;padding:20px;">Error: ${escFx(e.message)}</td></tr>`;
  }
}

async function getFlexAccountData(params) {
  try {
    if (typeof window.shopAPI.getFlexAccountTransactions === 'function') {
      return await window.shopAPI.getFlexAccountTransactions(params);
    }
  } catch (e) {
    const msg = String(e?.message || e);
    if (!msg.includes('No handler registered') && !msg.includes('get-flex-account-transactions')) throw e;
    console.warn('[FlexAccounts] Dedicated backend endpoint unavailable, using compatible fallback:', e);
  }
  return buildFlexAccountDataFromExistingApis(params);
}

async function buildFlexAccountDataFromExistingApis(params = {}) {
  const [bills, expenses] = await Promise.all([
    window.shopAPI.getFlexBills({ dateFrom: '', dateTo: '', search: params.search || '' }),
    window.shopAPI.getFlexExpenses({ dateFrom: params.dateFrom || '', dateTo: params.dateTo || '' })
  ]);

  const search = String(params.search || '').trim().toLowerCase();
  const dateFrom = params.dateFrom || '';
  const dateTo = params.dateTo || '';
  const entryType = params.entryType || '';
  const paymentMethod = params.paymentMethod || '';
  const rows = [];

  if (entryType !== 'expense') {
    const billPaymentRows = await Promise.all((bills || []).map(async bill => {
      const payments = await window.shopAPI.getFlexPayments(bill.id);
      return (payments || []).map(payment => ({
        id: payment.id,
        entry_type: 'income',
        txn_date: payment.payment_date,
        payment_method: payment.payment_method || bill.payment_method || 'cash',
        title: `Flex Payment ${bill.bill_no}`,
        description: `Client: ${bill.client_name || 'Walk-in'}`,
        amount: payment.amount || 0,
        notes: payment.notes || bill.description || '',
        created_at: payment.created_at || bill.created_at || ''
      }));
    }));
    rows.push(...billPaymentRows.flat());
  }

  if (entryType !== 'income' && (!paymentMethod || paymentMethod === 'cash')) {
    rows.push(...(expenses || []).map(exp => ({
      id: exp.id,
      entry_type: 'expense',
      txn_date: exp.expense_date,
      payment_method: 'cash',
      title: exp.description || 'Flex Expense',
      description: 'Flex expense',
      amount: exp.amount || 0,
      notes: exp.notes || '',
      created_at: exp.created_at || ''
    })));
  }

  const filteredRows = rows.filter(row => {
    if (dateFrom && row.txn_date < dateFrom) return false;
    if (dateTo && row.txn_date > dateTo) return false;
    if (entryType && row.entry_type !== entryType) return false;
    if (paymentMethod && row.payment_method !== paymentMethod) return false;
    if (search) {
      const haystack = `${row.title || ''} ${row.description || ''} ${row.notes || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  }).sort((a, b) => String(b.txn_date || '').localeCompare(String(a.txn_date || '')) || Number(b.id || 0) - Number(a.id || 0));

  const summary = filteredRows.reduce((acc, row) => {
    if (row.entry_type === 'income') acc.total_income += parseFloat(row.amount) || 0;
    else acc.total_expense += parseFloat(row.amount) || 0;
    return acc;
  }, { total_income: 0, total_expense: 0, net_balance: 0, outstanding: 0 });
  summary.net_balance = summary.total_income - summary.total_expense;

  const allBills = Array.isArray(bills) && (dateFrom || dateTo || search) ? await window.shopAPI.getFlexBills({}) : bills;
  summary.outstanding = (allBills || []).reduce((sum, bill) => sum + (parseFloat(bill.balance) || 0), 0);

  const methods = { cash: 0, jazzcash: 0, easypaisa: 0, bank_account: 0 };
  filteredRows.filter(row => row.entry_type === 'income').forEach(row => {
    const method = normalizeFlexPaymentMethod(row.payment_method);
    methods[method] += parseFloat(row.amount) || 0;
  });

  return { rows: filteredRows, summary, methods };
}

function clearFlexAccountFilters() {
  ['fx-acc-from','fx-acc-to','fx-acc-search'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const typeEl = document.getElementById('fx-acc-type'); if (typeEl) typeEl.value = '';
  const methodEl = document.getElementById('fx-acc-method'); if (methodEl) methodEl.value = '';
  loadFlexAccounts();
}

function setFlexText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function fxAccountTypeBadge(type) {
  const isExpense = type === 'expense';
  return `<span style="background:${isExpense ? '#FEE2E2' : '#DCFCE7'};color:${isExpense ? '#DC2626' : '#059669'};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;">${isExpense ? 'Expense' : 'Income'}</span>`;
}

function fxPaymentMethodLabel(method) {
  const v = String(method || '').toLowerCase();
  if (v === 'jazzcash') return 'JazzCash';
  if (v === 'easypaisa') return 'Easypaisa';
  if (v === 'bank_account') return 'Bank Transfer';
  return 'Cash';
}

function normalizeFlexPaymentMethod(method) {
  const v = String(method || '').toLowerCase();
  if (v === 'jazzcash' || v === 'easypaisa' || v === 'bank_account') return v;
  return 'cash';
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
  if (!dateFrom) { fxToast('Please choose a date!', 'warning'); return; }
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
