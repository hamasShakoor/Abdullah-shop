'use strict';

// ==================== STATE ====================
let settings = {};
let saleItems = [];
let quickBillItems = [];
let productsList = [];
let currentBillSaleId = null;
let isSavingBillPdf = false;
let isAutoSavingQuickBillPdf = false;
let currentPage = 'dashboard';
const FIXED_SALE_CATEGORIES = [
  { value: '3d_signboard', label: '3D SIGN BOARD' },
  { value: 'qatba_plate', label: 'QATBA PLATE' },
  { value: 'number_plate', label: 'NUMBER PLATE' },
  { value: 'stiker', label: 'STIKER' }
];
const ADD_CUSTOM_CATEGORY_VALUE = '__add_custom_category__';
const OWNER_NAMES = ['ABDULLAH', 'NAEEM HASSN'];
const OWNER_CUSTOM_VALUE = '__custom_owner__';
let histPage = 1;
let histSearchTimer = null;
let lastReportData = null;
let lastDailyReportData = null;
let plEditingId = null;
let profitLossRowsCache = [];
let dailyKhataEditingId = null;
let dailyKhataRowsCache = [];
let ownerEditingId = null;
let ownerRowsCache = [];
let ownerEditingOriginalKind = null;
let accountEditingId = null;
let accountRowsCache = [];
let accountsSearchTimer = null;
let accountPaymentSummary = { cash: 0, jazzcash: 0, easypaisa: 0, bank_account: 0 };
let accountBankList = [];

// ==================== INIT ====================
async function loadProductsCache() {
  try { productsList = await window.shopAPI.getProducts(); } catch(e) { productsList = []; }
}

async function init() {
  // Wait for modals to be injected into the DOM before proceeding
  if (window._modalsReady) await window._modalsReady;

  settings = await window.shopAPI.getSettings();
  await loadProductsCache();
  updateShopHeader();
  updateTopbarDate();
  autoSaveMissedDays(); // silently save PDFs for any missed past days

  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => showPage(el.dataset.page));
  });
  document.getElementById('modal-bill-overlay').addEventListener('click', function(e) { if (e.target === this) closeBillModal(); });
  document.getElementById('modal-confirm-overlay').addEventListener('click', function(e) { if (e.target === this) closeConfirm(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeBillModal(); closeConfirm(); } });

  showPage('profit-loss');
}

function updateShopHeader() {
  document.getElementById('sidebar-shop-name').textContent = settings.shop_name || 'Abdullah Shop';
}

function setDefaultSaleDate() {
  const el = document.getElementById('sale-date');
  if (el) el.value = new Date().toISOString().slice(0, 10);
}

function setDefaultQuickBillDate() {
  const el = document.getElementById('qb-sale-date');
  if (el) el.value = new Date().toISOString().slice(0, 10);
}

function setupDailyReportDate() {
  const el = document.getElementById('daily-rep-date');
  if (el) el.value = new Date().toISOString().slice(0, 10);
}

function setupProductBillDate() {
  const el = document.getElementById('pb-date');
  if (el) el.value = new Date().toISOString().slice(0, 10);
}

function setupYearSelect() {
  const sel = document.getElementById('rep-year');
  if (!sel) return;
  if (sel.options.length > 0) return; // already populated
  const cur = new Date().getFullYear();
  for (let y = cur; y >= cur - 4; y--) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    sel.appendChild(o);
  }
  sel.value = cur;
  const monthEl = document.getElementById('rep-month');
  if (monthEl) monthEl.value = String(new Date().getMonth() + 1).padStart(2, '0');
}

function updateTopbarDate() {
  const el = document.getElementById('date-text');
  if (el) el.textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// ==================== NAVIGATION ====================
const pageConfig = {
  'profit-loss':   { title: 'Daily Ledger Entry',     subtitle: 'Daily expenses and product ledger tracking',        icon: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>' },
  dashboard:       { title: 'Dashboard',         subtitle: 'Overview & Analytics',                    icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>' },
  'new-sale':      { title: 'New Sale',           subtitle: 'Create invoice & record payment',        icon: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' },
  'quick-bill':    { title: 'Manual Bill',        subtitle: 'Quick bill for manual sales entry',      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>' },
  history:         { title: 'Sales History',      subtitle: 'All transactions & records',             icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
  reports:         { title: 'Monthly Reports',    subtitle: 'Revenue & performance reports',          icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
  'daily-reports': { title: 'Daily Reports',      subtitle: 'Daily sales and revenue details',    icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
  products:        { title: 'Products',           subtitle: 'Manage your products',                  icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' },
  'owner-ledger':  { title: 'Owner Ledger',       subtitle: 'Withdrawals and returns for both owners', icon: '<path d="M3 3h18v18H3z"/><path d="M7 8h10"/><path d="M7 12h6"/><path d="M7 16h4"/>' },
  accounts:        { title: 'Accounts Center',    subtitle: 'Complete project transactions & payment methods', icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
  settings:        { title: 'Settings',           subtitle: 'Shop configuration & preferences',       icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
  'flex-module':   { title: 'Flex Module',         subtitle: 'Flex printing — bills, payments, expenses & reports', icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>' },
};

async function showPage(page) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));

  const cfg = pageConfig[page] || {};
  document.getElementById('page-title').textContent = cfg.title || page;
  document.getElementById('page-subtitle').textContent = cfg.subtitle || '';
  const iconEl = document.getElementById('topbar-icon');
  if (iconEl && cfg.icon) iconEl.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${cfg.icon}</svg>`;

  document.getElementById('topbar-actions').innerHTML = '';
  currentPage = page;

  // Check if page section already exists in #content
  let pageEl = document.getElementById('page-' + page);
  if (!pageEl) {
    // Load page HTML dynamically and inject into #content
    const html = await loadPageContent(page);
    if (html) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      const section = wrapper.querySelector('section, .page');
      if (section) {
        document.getElementById('content').appendChild(section);
        pageEl = document.getElementById('page-' + page);
      }
    }
  }

  // Show/hide pages
  document.querySelectorAll('#content .page').forEach(el => el.classList.remove('active'));
  if (pageEl) pageEl.classList.add('active');

  if (page === 'profit-loss') { setupProfitLossForm(); loadProfitLoss(); }
  else if (page === 'dashboard') loadDashboard();
  else if (page === 'new-sale') initNewSale();
  else if (page === 'quick-bill') initQuickBill();
  else if (page === 'history') loadHistory(1);
  else if (page === 'reports') loadReport();
  else if (page === 'daily-reports') loadDailyReport();
  else if (page === 'products') loadProductsPage();
  else if (page === 'owner-ledger') loadOwnerLedgerPage();
  else if (page === 'accounts') loadAccountsPage();
  else if (page === 'settings') loadSettings();
  else if (page === 'flex-module') loadFlexModule();
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
  try {
    const data = await window.shopAPI.getDashboardStats();

    // Today
    document.getElementById('td-bills').textContent = data.today.total_sales;
    document.getElementById('td-rev').textContent = formatCurrency(data.today.total_revenue);
    document.getElementById('td-col').textContent = formatCurrency(data.today.collected);
    document.getElementById('td-pen').textContent = formatCurrency(data.today.pending);
    document.getElementById('td-sqft').textContent = (data.today.sq_ft || 0).toFixed(1) + ' ft²';

    // Month
    document.getElementById('mo-bills').textContent = data.month.total_sales;
    document.getElementById('mo-rev').textContent = formatCurrency(data.month.total_revenue);
    document.getElementById('mo-col').textContent = formatCurrency(data.month.collected);
    document.getElementById('mo-pen').textContent = formatCurrency(data.month.pending);
    document.getElementById('mo-sqft').textContent = (data.month.sq_ft || 0).toFixed(1) + ' ft²';

    // Khata
    const khataToday = data?.khata?.today || {};
    const khataMonth = data?.khata?.month || {};
    document.getElementById('td-khata').textContent = formatCurrency(khataToday.total_amount || 0);
    document.getElementById('td-khata-count').textContent = khataToday.total_entries || 0;
    document.getElementById('mo-khata').textContent = formatCurrency(khataMonth.total_amount || 0);
    document.getElementById('mo-khata-count').textContent = khataMonth.total_entries || 0;

    // Date
    const now = new Date();
    document.getElementById('dash-date-full').textContent =
      now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    renderCatBreakdown(data.catBreak);
    renderRecentSales(data.recentSales);
    renderDashboardKhataDaily(data?.khata?.daily || []);

    // 12-month chart
    const labels = [], values = [];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const last12Data = Array.isArray(data.last12) ? data.last12 : [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const found = last12Data.find(r => r.month === key);
      labels.push(monthNames[d.getMonth()]);
      values.push(found ? Math.round(found.revenue) : 0);
    }
    setTimeout(() => initRevenueChart(labels, values), 80);
  } catch (e) {
    showToast('Dashboard failed to load: ' + e.message, 'error');
  }
}

function renderCatBreakdown(catData) {
  const el = document.getElementById('cat-breakdown');
  if (!catData || catData.length === 0) {
    el.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No sales recorded this month</p></div>';
    return;
  }
  const total = catData.reduce((s, c) => s + c.revenue, 0);
  el.innerHTML = catData.map(c => {
    const pct = total > 0 ? ((c.revenue / total) * 100).toFixed(1) : 0;
    return `<div class="cat-bar-item">
      <div class="cat-bar-top">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="badge ${getCategoryBadgeClass(c.category)}">${getCategoryName(c.category)}</span>
          <span class="text-sm text-muted">${c.cnt} items</span>
        </div>
        <span class="font-bold" style="font-size:13px;">${formatCurrency(c.revenue)}</span>
      </div>
      <div class="cat-bar-track">
        <div class="cat-bar-fill" style="width:${pct}%;background:${getCategoryColor(c.category)};"></div>
      </div>
    </div>`;
  }).join('');
}

function renderRecentSales(sales) {
  const tbody = document.getElementById('recent-sales-body');
  if (!sales || sales.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="no-data">No recent sales found</td></tr>';
    return;
  }
  tbody.innerHTML = sales.map(s => `
    <tr>
      <td><span class="badge badge-blue">${s.bill_no}</span></td>
      <td class="font-semibold">${s.customer_name || '<span class="text-muted">Walk-in</span>'}</td>
      <td class="font-bold">${formatCurrency(s.total_amount)}</td>
      <td class="text-success font-semibold">${formatCurrency(s.paid_amount)}</td>
      <td class="${s.balance > 0 ? 'text-danger font-bold' : 'text-success font-semibold'}">${formatCurrency(s.balance)}</td>
      <td>${s.balance > 0 ? '<span class="chip-pending">Pending</span>' : '<span class="chip-paid">Paid</span>'}</td>
      <td class="text-muted">${formatDate(s.sale_date)}</td>
      <td>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="viewBill(${s.id})" title="View Bill">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </td>
    </tr>`).join('');
}

function renderDashboardKhataDaily(rows) {
  const tbody = document.getElementById('dash-khata-day-body');
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="no-data">No daily expense entries this month</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="font-semibold">${formatDate(r.entry_date)}</td>
      <td><span class="badge badge-blue">${r.total_entries || 0}</span></td>
      <td class="text-danger font-semibold">${formatCurrency(r.total_amount || 0)}</td>
    </tr>
  `).join('');
}

let revenueChart = null;
let chartLabels = [];
let chartValues = [];
let currentChartType = 'bar';

function initRevenueChart(labels, values) {
  const el = document.getElementById('apex-revenue-chart');
  if (!el || typeof ApexCharts === 'undefined') return;
  chartLabels = labels;
  chartValues = values;
  currentChartType = 'bar';
  if (revenueChart) { revenueChart.destroy(); revenueChart = null; }
  revenueChart = new ApexCharts(el, buildChartOptions('bar', labels, values));
  revenueChart.render();
  updateChartBtns('bar');
}

function switchChartType(type) {
  if (!revenueChart || currentChartType === type) return;
  currentChartType = type;
  const el = document.getElementById('apex-revenue-chart');
  el.style.minHeight = '260px';
  revenueChart.destroy();
  revenueChart = new ApexCharts(el, buildChartOptions(type, chartLabels, chartValues));
  revenueChart.render();
  updateChartBtns(type);
}

function updateChartBtns(active) {
  ['bar','line','area'].forEach(t => {
    const btn = document.getElementById('chart-btn-' + t);
    if (!btn) return;
    if (t === active) {
      btn.style.background = 'var(--primary)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'var(--primary)';
    } else {
      btn.style.background = 'var(--bg2)';
      btn.style.color = 'var(--muted)';
      btn.style.borderColor = 'var(--border)';
    }
  });
}

function fmtK(v) {
  if (v === 0) return '';
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return Math.round(v).toString();
}

function buildChartOptions(type, labels, values) {
  const isArea = type === 'area';
  const isBar  = type === 'bar';
  return {
    chart: {
      type: type,
      height: 260,
      toolbar: { show: false },
      animations: { enabled: true, speed: 400 },
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      background: 'transparent',
    },
    series: [{ name: 'Revenue', data: values }],
    xaxis: {
      categories: labels,
      labels: { style: { colors: '#94A3B8', fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#94A3B8', fontSize: '11px' },
        formatter: v => fmtK(v),
      },
    },
    colors: ['#2563EB'],
    fill: isArea
      ? { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.03, stops: [0, 100] } }
      : isBar
        ? { type: 'gradient', gradient: { shade: 'light', type: 'vertical', shadeIntensity: 0.3, gradientToColors: ['#60A5FA'], inverseColors: false, opacityFrom: 1, opacityTo: 1, stops: [0, 100] } }
        : { type: 'solid' },
    stroke: isBar ? { show: false } : { curve: 'smooth', width: 2.5 },
    markers: isBar ? {} : { size: 5, colors: ['#2563EB'], strokeColors: '#fff', strokeWidth: 2, hover: { size: 7 } },
    plotOptions: isBar ? {
      bar: { borderRadius: 6, columnWidth: '50%', dataLabels: { position: 'top' } }
    } : {},
    dataLabels: {
      enabled: true,
      formatter: v => fmtK(v),
      offsetY: isBar ? -6 : -10,
      style: {
        fontSize: isBar ? '10px' : '10px',
        colors: isBar ? ['#1E293B'] : ['#2563EB'],
        fontWeight: 700,
      },
      background: isBar ? { enabled: false } : {
        enabled: true, foreColor: '#2563EB', padding: 3,
        borderRadius: 3, borderWidth: 1, borderColor: '#DBEAFE',
        opacity: 1, dropShadow: { enabled: false }
      },
    },
    grid: {
      borderColor: '#E2E8F0',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      padding: { top: 20 },
    },
    tooltip: {
      y: { formatter: v => 'Rs. ' + Math.round(v).toLocaleString() },
      theme: 'light',
    },
  };
}

function shortNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toString();
}

// ==================== NEW SALE ====================
async function initNewSale() {
  await loadProductsCache();
  if (saleItems.length === 0) resetSaleForm();
}

function resetSaleForm() {
  saleItems = [];
  document.getElementById('cust-name').value = '';
  document.getElementById('cust-phone').value = '';
  document.getElementById('sale-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('sale-notes').value = '';
  document.getElementById('sale-discount').value = '0';
  document.getElementById('sale-paid').value = '0';
  const methodEl = document.getElementById('sale-payment-method');
  if (methodEl) methodEl.value = 'cash';
  renderItemRows();
  calcSaleTotal();
}

function addItemRow() {
  saleItems.push({
    category: 'number_plate',
    is_custom_category: false,
    measure_type: 'qty',
    custom_type_name: '',
    description: '',
    width_inch: 0,
    height_inch: 0,
    sq_ft: 0,
    quantity: 1,
    unit_price: 0,
    total_price: 0
  });
  renderItemRows();
  setTimeout(() => document.getElementById('item-desc-' + (saleItems.length - 1))?.focus(), 50);
}

function removeItemRow(idx) {
  saleItems.splice(idx, 1);
  renderItemRows();
  calcSaleTotal();
}

function renderItemRows() {
  const container = document.getElementById('items-container');
  const noItems = document.getElementById('no-items');
  if (saleItems.length === 0) { container.innerHTML = ''; noItems.style.display = 'block'; return; }
  noItems.style.display = 'none';
  container.innerHTML = saleItems.map((item, idx) => itemRowHTML(idx, item)).join('');
}

function itemRowHTML(idx, item) {
  const isSz = isSizeBasedItem(item);
  const measureType = getItemMeasureType(item);
  const customCategoryMode = !!item.is_custom_category || isCustomCategory(item.category);
  const categoryLabel = (item.category || '').trim() ? getCategoryName(item.category) : 'Custom Category';
  const currentTypeLabel = getItemTypeLabel(item);
  const sqFt = isSz ? inchesToSqFt(item.width_inch, item.height_inch) : 0;
  const total = item.total_price || 0;

  return `<div class="item-row" id="item-row-${idx}">
    <div class="item-row-header">
      <div class="item-num-badge">
        <div class="item-num-circle">${idx + 1}</div>
        <span class="badge ${getCategoryBadgeClass(item.category)}" id="item-cat-badge-${idx}">${escHtml(categoryLabel)}</span>
        <span class="badge badge-gray" style="font-size:10.5px;" id="item-type-badge-${idx}">${escHtml(currentTypeLabel)}</span>
      </div>
      <button class="btn btn-danger btn-sm btn-icon" onclick="removeItemRow(${idx})" title="Remove item">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div style="display:grid;grid-template-columns:160px 200px 150px 1fr;gap:12px;margin-bottom:12px;">
      <div class="form-group">
        <label>Category</label>
        <select class="form-control" id="item-cat-${idx}" onchange="onCategoryChange(${idx})">
          ${getSaleCategoryOptionsHTML(item.category, customCategoryMode)}
        </select>
        ${customCategoryMode ? `
          <input class="form-control" id="item-custom-cat-${idx}" style="margin-top:8px;"
            placeholder="Enter custom category name" value="${escHtml(item.category || '')}"
            oninput="onCustomCategoryInput(${idx})">
        ` : ''}
      </div>
      <div class="form-group">
        <label>Select Product</label>
        <select class="form-control" id="item-prod-${idx}" onchange="onProductSelect(${idx})">
          <option value="">-- Manual Entry --</option>
          ${productsList.filter(p => p.category === item.category).map(p => `<option value="${p.id}" data-price="${p.unit_price}" data-name="${escHtml(p.name)}">${escHtml(p.name)} (Rs. ${Math.round(p.unit_price).toLocaleString()})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Type</label>
        <select class="form-control" id="item-measure-${idx}" onchange="onMeasureTypeChange(${idx})">
          <option value="qty" ${measureType === 'qty' ? 'selected' : ''}>Qty</option>
          <option value="size" ${measureType === 'size' ? 'selected' : ''}>Feet (W × H)</option>
          <option value="custom" ${measureType === 'custom' ? 'selected' : ''}>Custom Type</option>
        </select>
        ${measureType === 'custom' ? `
          <input class="form-control" id="item-custom-type-${idx}" style="margin-top:8px;"
            placeholder="Enter custom type name" value="${escHtml(item.custom_type_name || '')}"
            oninput="onCustomTypeInput(${idx})">
        ` : ''}
        <div class="field-hint" id="item-type-hint-${idx}" style="margin-top:6px;">Current type: ${escHtml(currentTypeLabel)}</div>
      </div>
      <div class="form-group">
        <label>Description</label>
        <input class="form-control" id="item-desc-${idx}" value="${escHtml(item.description)}"
          placeholder="${isSz ? 'e.g. Shop front banner, red background...' : 'e.g. Standard number plate, black text...'}"
          oninput="saleItems[${idx}].description=this.value">
      </div>
    </div>

    ${isSz ? `
      <div style="display:grid;grid-template-columns:1fr 22px 1fr 1.1fr 1fr 1fr;gap:10px;align-items:end;">
        <div class="form-group">
          <label>Width (Feet)</label>
          <input class="form-control" type="number" id="item-w-${idx}" value="${item.width_inch || ''}"
            placeholder="e.g. 4" min="0" step="0.1" oninput="onSizeChange(${idx})">
        </div>
        <div class="multiply-sign">×</div>
        <div class="form-group">
          <label>Height (Feet)</label>
          <input class="form-control" type="number" id="item-h-${idx}" value="${item.height_inch || ''}"
            placeholder="e.g. 2" min="0" step="0.1" oninput="onSizeChange(${idx})">
        </div>
        <div class="form-group">
          <label>= Sq. Ft (Auto)</label>
          <div class="sq-ft-display" id="item-sqft-${idx}">${sqFt > 0 ? sqFt.toFixed(3) + ' ft²' : '— ft²'}</div>
        </div>
        <div class="form-group">
          <label>Rate / Sq.Ft (Rs.)</label>
          <input class="form-control" type="number" id="item-price-${idx}" value="${item.unit_price || ''}"
            placeholder="e.g. 200" min="0" step="1" oninput="onPriceChange(${idx})">
        </div>
        <div class="form-group">
          <label>Total (Rs.)</label>
          <div class="item-total-display" id="item-total-${idx}">Rs. ${total > 0 ? Math.round(total).toLocaleString() : '—'}</div>
        </div>
      </div>
    ` : `
      <div style="display:grid;grid-template-columns:130px 1fr 180px;gap:12px;align-items:end;">
        <div class="form-group">
          <label>Quantity</label>
          <input class="form-control" type="number" id="item-qty-${idx}" value="${item.quantity || 1}"
            min="1" step="1" oninput="onQtyChange(${idx})">
        </div>
        <div class="form-group">
          <label>Unit Price (Rs.)</label>
          <input class="form-control" type="number" id="item-price-${idx}" value="${item.unit_price || ''}"
            placeholder="e.g. 500" min="0" step="1" oninput="onPriceChange(${idx})">
        </div>
        <div class="form-group">
          <label>Total (Rs.)</label>
          <div class="item-total-display" id="item-total-${idx}">Rs. ${total > 0 ? Math.round(total).toLocaleString() : '—'}</div>
        </div>
      </div>
    `}
  </div>`;
}

function onCategoryChange(idx) {
  const select = document.getElementById('item-cat-' + idx);
  if (!select) return;
  const prevItem = saleItems[idx] || { category: 'number_plate', is_custom_category: false, measure_type: 'qty', custom_type_name: '' };
  const prevMeasureType = getItemMeasureType(prevItem);
  let cat = select.value;
  let customCategoryMode = !!prevItem.is_custom_category;
  if (cat === ADD_CUSTOM_CATEGORY_VALUE) {
    customCategoryMode = true;
    cat = isCustomCategory(prevItem.category) ? prevItem.category : '';
  } else {
    customCategoryMode = isCustomCategory(cat);
  }
  const desc = document.getElementById('item-desc-' + idx)?.value || '';
  saleItems[idx] = {
    category: cat,
    is_custom_category: customCategoryMode,
    measure_type: prevMeasureType,
    custom_type_name: prevItem.custom_type_name || '',
    description: desc,
    width_inch: 0,
    height_inch: 0,
    sq_ft: 0,
    quantity: 1,
    unit_price: 0,
    total_price: 0
  };
  const row = document.getElementById('item-row-' + idx);
  const tmp = document.createElement('div');
  tmp.innerHTML = itemRowHTML(idx, saleItems[idx]);
  row.replaceWith(tmp.firstElementChild);
  calcSaleTotal();
}

function onMeasureTypeChange(idx) {
  const item = saleItems[idx];
  if (!item) return;
  const sel = document.getElementById('item-measure-' + idx);
  if (!sel) return;
  item.measure_type = sel.value === 'size' ? 'size' : (sel.value === 'custom' ? 'custom' : 'qty');
  if (item.measure_type === 'size') {
    item.quantity = 1;
  } else {
    item.width_inch = 0;
    item.height_inch = 0;
    item.sq_ft = 0;
  }
  const row = document.getElementById('item-row-' + idx);
  const tmp = document.createElement('div');
  tmp.innerHTML = itemRowHTML(idx, item);
  row.replaceWith(tmp.firstElementChild);
  calcItemTotal(idx);
}

function onCustomCategoryInput(idx) {
  const item = saleItems[idx];
  if (!item) return;
  const input = document.getElementById('item-custom-cat-' + idx);
  const val = input ? input.value.trim() : '';
  item.category = val;
  item.is_custom_category = true;
  const badge = document.getElementById('item-cat-badge-' + idx);
  if (badge) badge.textContent = val || 'Custom Category';
}

function onCustomTypeInput(idx) {
  const item = saleItems[idx];
  if (!item) return;
  const input = document.getElementById('item-custom-type-' + idx);
  const val = input ? input.value.trim() : '';
  item.custom_type_name = val;
  const typeLabel = val || 'Custom Type';
  const badge = document.getElementById('item-type-badge-' + idx);
  const hint = document.getElementById('item-type-hint-' + idx);
  if (badge) badge.textContent = typeLabel;
  if (hint) hint.textContent = 'Current type: ' + typeLabel;
}

function onProductSelect(idx) {
  const sel = document.getElementById('item-prod-' + idx);
  if (!sel || !sel.value) return;
  const opt = sel.selectedOptions[0];
  const price = parseFloat(opt.dataset.price) || 0;
  const name = opt.dataset.name || '';
  const descEl = document.getElementById('item-desc-' + idx);
  const priceEl = document.getElementById('item-price-' + idx);
  if (descEl) { descEl.value = name; saleItems[idx].description = name; }
  if (priceEl) { priceEl.value = price; saleItems[idx].unit_price = price; }
  calcItemTotal(idx);
}

function onSizeChange(idx) {
  const w = parseFloat(document.getElementById('item-w-' + idx)?.value) || 0;
  const h = parseFloat(document.getElementById('item-h-' + idx)?.value) || 0;
  saleItems[idx].width_inch = w; saleItems[idx].height_inch = h;
  const sqft = inchesToSqFt(w, h); saleItems[idx].sq_ft = sqft;
  const el = document.getElementById('item-sqft-' + idx);
  if (el) el.textContent = sqft > 0 ? sqft.toFixed(3) + ' ft²' : '— ft²';
  calcItemTotal(idx);
}

function onPriceChange(idx) {
  saleItems[idx].unit_price = parseFloat(document.getElementById('item-price-' + idx)?.value) || 0;
  calcItemTotal(idx);
}

function onQtyChange(idx) {
  saleItems[idx].quantity = parseInt(document.getElementById('item-qty-' + idx)?.value) || 1;
  calcItemTotal(idx);
}

function calcItemTotal(idx) {
  const item = saleItems[idx];
  const isSz = isSizeBasedItem(item);
  const total = isSz ? (item.sq_ft * item.unit_price) : ((item.quantity || 1) * item.unit_price);
  saleItems[idx].total_price = total;
  const el = document.getElementById('item-total-' + idx);
  if (el) el.textContent = 'Rs. ' + (total > 0 ? Math.round(total).toLocaleString() : '—');
  calcSaleTotal();
}

function calcSaleTotal() {
  const subtotal = saleItems.reduce((s, i) => s + (i.total_price || 0), 0);
  const discount = parseFloat(document.getElementById('sale-discount')?.value) || 0;
  const total = subtotal - discount;
  const paid = parseFloat(document.getElementById('sale-paid')?.value) || 0;
  const balance = total - paid;

  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  set('t-subtotal', 'Rs. ' + Math.round(subtotal).toLocaleString());
  set('t-discount', discount > 0 ? '— Rs. ' + Math.round(discount).toLocaleString() : 'No discount');
  set('t-total', 'Rs. ' + Math.round(total).toLocaleString());
  set('t-paid', 'Rs. ' + Math.round(paid).toLocaleString());
  set('t-balance', 'Rs. ' + Math.round(Math.abs(balance)).toLocaleString());

  const balRow = document.getElementById('balance-row');
  if (balRow) {
    balRow.className = 'summary-row ' + (balance > 0 ? 'total-balance' : 'total-clear');
    const balLabel = balRow.querySelector('span:first-child');
    if (balLabel) balLabel.textContent = balance > 0 ? 'Balance Due' : '✓ Fully Paid';
  }

}

async function submitSale() {
  if (saleItems.length === 0) { showToast('Please add at least one item!', 'error'); return; }
  const badCustomCategory = saleItems.find(i => (i.is_custom_category || isCustomCategory(i.category)) && !(i.category || '').trim());
  if (badCustomCategory) { showToast('Please enter a custom category name!', 'error'); return; }
  const badCustomType = saleItems.find(i => getItemMeasureType(i) === 'custom' && !(i.custom_type_name || '').trim());
  if (badCustomType) { showToast('Please enter a custom type name!', 'error'); return; }
  const badPrice = saleItems.find(i => !i.unit_price || i.unit_price <= 0);
  if (badPrice) { showToast('Please enter price for all items!', 'error'); return; }
  const badSize = saleItems.find(i => isSizeBasedItem(i) && (!i.width_inch || !i.height_inch));
  if (badSize) { showToast('Please enter width & height for all size-based items!', 'error'); return; }

  const saleData = {
    customer_name: document.getElementById('cust-name').value,
    customer_phone: document.getElementById('cust-phone').value,
    sale_date: document.getElementById('sale-date').value,
    notes: document.getElementById('sale-notes').value,
    discount: parseFloat(document.getElementById('sale-discount').value) || 0,
    paid_amount: parseFloat(document.getElementById('sale-paid').value) || 0,
    payment_method: document.getElementById('sale-payment-method')?.value || 'cash',
    items: saleItems.map(i => ({ ...i }))
  };
  try {
    const result = await window.shopAPI.saveSale(saleData);
    showToast('Bill ' + result.bill_no + ' saved successfully!', 'success');
    resetSaleForm();
    setTimeout(() => viewBill(result.sale_id), 600);
  } catch (e) {
    showToast('Failed to save sale: ' + e.message, 'error');
  }
}

// ==================== MANUAL BILL ====================
function createQuickBillItem() {
  return {
    category: 'number_plate',
    is_custom_category: false,
    measure_type: 'qty',
    custom_type_name: '',
    description: '',
    width_inch: 0,
    height_inch: 0,
    sq_ft: 0,
    quantity: 1,
    unit_price: 0,
    total_price: 0
  };
}

async function initQuickBill() {
  await loadProductsCache();
  if (quickBillItems.length === 0) resetQuickBillForm();
}

function resetQuickBillForm() {
  quickBillItems = [createQuickBillItem()];
  document.getElementById('qb-cust-name').value = '';
  document.getElementById('qb-cust-phone').value = '';
  document.getElementById('qb-sale-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('qb-notes').value = '';
  document.getElementById('qb-discount').value = '0';
  document.getElementById('qb-paid').value = '0';
  const methodEl = document.getElementById('qb-payment-method');
  const autoPdfEl = document.getElementById('qb-auto-save-pdf');
  if (methodEl) methodEl.value = 'cash';
  if (autoPdfEl) autoPdfEl.checked = true;
  renderQuickBillRows();
  calcQuickBillTotal();
}

function addQuickBillRow() {
  quickBillItems.push(createQuickBillItem());
  renderQuickBillRows();
  setTimeout(() => document.getElementById('qb-item-desc-' + (quickBillItems.length - 1))?.focus(), 50);
}

function removeQuickBillRow(idx) {
  quickBillItems.splice(idx, 1);
  renderQuickBillRows();
  calcQuickBillTotal();
}

function renderQuickBillRows() {
  const container = document.getElementById('qb-items-container');
  const noItems = document.getElementById('qb-no-items');
  if (!container || !noItems) return;
  if (quickBillItems.length === 0) {
    container.innerHTML = '';
    noItems.style.display = 'block';
    return;
  }
  noItems.style.display = 'none';
  container.innerHTML = quickBillItems.map((item, idx) => quickBillRowHTML(idx, item)).join('');
}

function quickBillRowHTML(idx, item) {
  const isSz = isSizeBasedItem(item);
  const measureType = getItemMeasureType(item);
  const customCategoryMode = !!item.is_custom_category || isCustomCategory(item.category);
  const categoryLabel = (item.category || '').trim() ? getCategoryName(item.category) : 'Custom Category';
  const currentTypeLabel = getItemTypeLabel(item);
  const sqFt = isSz ? inchesToSqFt(item.width_inch, item.height_inch) : 0;
  const total = item.total_price || 0;

  return `<div class="item-row" id="qb-item-row-${idx}">
    <div class="item-row-header">
      <div class="item-num-badge">
        <div class="item-num-circle">${idx + 1}</div>
        <span class="badge ${getCategoryBadgeClass(item.category)}" id="qb-item-cat-badge-${idx}">${escHtml(categoryLabel)}</span>
        <span class="badge badge-gray" style="font-size:10.5px;" id="qb-item-type-badge-${idx}">${escHtml(currentTypeLabel)}</span>
      </div>
      <button class="btn btn-danger btn-sm btn-icon" onclick="removeQuickBillRow(${idx})" title="Remove item">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div style="display:grid;grid-template-columns:160px 200px 150px 1fr;gap:12px;margin-bottom:12px;">
      <div class="form-group">
        <label>Category</label>
        <select class="form-control" id="qb-item-cat-${idx}" onchange="onQuickBillCategoryChange(${idx})">
          ${getSaleCategoryOptionsHTML(item.category, customCategoryMode)}
        </select>
        ${customCategoryMode ? `
          <input class="form-control" id="qb-item-custom-cat-${idx}" style="margin-top:8px;"
            placeholder="Enter custom category name" value="${escHtml(item.category || '')}"
            oninput="onQuickBillCustomCategoryInput(${idx})">
        ` : ''}
      </div>
      <div class="form-group">
        <label>Select Product</label>
        <select class="form-control" id="qb-item-prod-${idx}" onchange="onQuickBillProductSelect(${idx})">
          <option value="">-- Manual Entry --</option>
          ${productsList.filter(p => p.category === item.category).map(p => `<option value="${p.id}" data-price="${p.unit_price}" data-name="${escHtml(p.name)}">${escHtml(p.name)} (Rs. ${Math.round(p.unit_price).toLocaleString()})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Type</label>
        <select class="form-control" id="qb-item-measure-${idx}" onchange="onQuickBillMeasureTypeChange(${idx})">
          <option value="qty" ${measureType === 'qty' ? 'selected' : ''}>Qty</option>
          <option value="size" ${measureType === 'size' ? 'selected' : ''}>Feet (W × H)</option>
          <option value="custom" ${measureType === 'custom' ? 'selected' : ''}>Custom Type</option>
        </select>
        ${measureType === 'custom' ? `
          <input class="form-control" id="qb-item-custom-type-${idx}" style="margin-top:8px;"
            placeholder="Enter custom type name" value="${escHtml(item.custom_type_name || '')}"
            oninput="onQuickBillCustomTypeInput(${idx})">
        ` : ''}
        <div class="field-hint" id="qb-item-type-hint-${idx}" style="margin-top:6px;">Current type: ${escHtml(currentTypeLabel)}</div>
      </div>
      <div class="form-group">
        <label>Item Description</label>
        <input class="form-control" id="qb-item-desc-${idx}" value="${escHtml(item.description || '')}"
          placeholder="${isSz ? 'e.g. Shop front banner, red background...' : 'e.g. Standard number plate, black text...'}"
          oninput="onQuickBillDescriptionInput(${idx}, this.value)">
      </div>
    </div>

    ${isSz ? `
      <div style="display:grid;grid-template-columns:1fr 22px 1fr 1.1fr 1fr 1fr;gap:10px;align-items:end;">
        <div class="form-group">
          <label>Width (Feet)</label>
          <input class="form-control" type="number" id="qb-item-w-${idx}" value="${item.width_inch || ''}"
            placeholder="e.g. 4" min="0" step="0.1" oninput="onQuickBillSizeChange(${idx})">
        </div>
        <div class="multiply-sign">×</div>
        <div class="form-group">
          <label>Height (Feet)</label>
          <input class="form-control" type="number" id="qb-item-h-${idx}" value="${item.height_inch || ''}"
            placeholder="e.g. 2" min="0" step="0.1" oninput="onQuickBillSizeChange(${idx})">
        </div>
        <div class="form-group">
          <label>= Sq. Ft (Auto)</label>
          <div class="sq-ft-display" id="qb-item-sqft-${idx}">${sqFt > 0 ? sqFt.toFixed(3) + ' ft²' : '— ft²'}</div>
        </div>
        <div class="form-group">
          <label>Rate / Sq.Ft (Rs.)</label>
          <input class="form-control" type="number" id="qb-item-price-${idx}" value="${item.unit_price || ''}"
            placeholder="e.g. 200" min="0" step="1" oninput="onQuickBillPriceChange(${idx})">
        </div>
        <div class="form-group">
          <label>Total (Rs.)</label>
          <div class="item-total-display" id="qb-item-total-${idx}">Rs. ${total > 0 ? Math.round(total).toLocaleString() : '—'}</div>
        </div>
      </div>
    ` : `
      <div style="display:grid;grid-template-columns:130px 1fr 180px;gap:12px;align-items:end;">
        <div class="form-group">
          <label>Quantity</label>
          <input class="form-control" type="number" id="qb-item-qty-${idx}" value="${item.quantity || 1}"
            min="1" step="1" oninput="onQuickBillQtyChange(${idx})">
        </div>
        <div class="form-group">
          <label>Unit Price (Rs.)</label>
          <input class="form-control" type="number" id="qb-item-price-${idx}" value="${item.unit_price || ''}"
            placeholder="e.g. 500" min="0" step="1" oninput="onQuickBillPriceChange(${idx})">
        </div>
        <div class="form-group">
          <label>Total (Rs.)</label>
          <div class="item-total-display" id="qb-item-total-${idx}">Rs. ${total > 0 ? Math.round(total).toLocaleString() : '—'}</div>
        </div>
      </div>
    `}
  </div>`;
}

function onQuickBillDescriptionInput(idx, value) {
  if (!quickBillItems[idx]) return;
  quickBillItems[idx].description = value || '';
}

function onQuickBillCategoryChange(idx) {
  const select = document.getElementById('qb-item-cat-' + idx);
  if (!select) return;
  const prevItem = quickBillItems[idx] || createQuickBillItem();
  const prevMeasureType = getItemMeasureType(prevItem);
  let cat = select.value;
  let customCategoryMode = !!prevItem.is_custom_category;
  if (cat === ADD_CUSTOM_CATEGORY_VALUE) {
    customCategoryMode = true;
    cat = isCustomCategory(prevItem.category) ? prevItem.category : '';
  } else {
    customCategoryMode = isCustomCategory(cat);
  }
  const desc = document.getElementById('qb-item-desc-' + idx)?.value || '';
  quickBillItems[idx] = {
    ...createQuickBillItem(),
    category: cat,
    is_custom_category: customCategoryMode,
    measure_type: prevMeasureType,
    custom_type_name: prevItem.custom_type_name || '',
    description: desc
  };
  renderQuickBillRows();
  calcQuickBillTotal();
}

function onQuickBillMeasureTypeChange(idx) {
  const item = quickBillItems[idx];
  if (!item) return;
  const sel = document.getElementById('qb-item-measure-' + idx);
  if (!sel) return;
  item.measure_type = sel.value === 'size' ? 'size' : (sel.value === 'custom' ? 'custom' : 'qty');
  if (item.measure_type === 'size') {
    item.quantity = 1;
  } else {
    item.width_inch = 0;
    item.height_inch = 0;
    item.sq_ft = 0;
  }
  renderQuickBillRows();
  calcQuickBillItemTotal(idx);
}

function onQuickBillCustomCategoryInput(idx) {
  const item = quickBillItems[idx];
  if (!item) return;
  const input = document.getElementById('qb-item-custom-cat-' + idx);
  const val = input ? input.value.trim() : '';
  item.category = val;
  item.is_custom_category = true;
  const badge = document.getElementById('qb-item-cat-badge-' + idx);
  if (badge) badge.textContent = val || 'Custom Category';
}

function onQuickBillCustomTypeInput(idx) {
  const item = quickBillItems[idx];
  if (!item) return;
  const input = document.getElementById('qb-item-custom-type-' + idx);
  const val = input ? input.value.trim() : '';
  item.custom_type_name = val;
  const typeLabel = val || 'Custom Type';
  const badge = document.getElementById('qb-item-type-badge-' + idx);
  const hint = document.getElementById('qb-item-type-hint-' + idx);
  if (badge) badge.textContent = typeLabel;
  if (hint) hint.textContent = 'Current type: ' + typeLabel;
}

function onQuickBillProductSelect(idx) {
  const sel = document.getElementById('qb-item-prod-' + idx);
  if (!sel || !sel.value) return;
  const opt = sel.selectedOptions[0];
  const price = parseFloat(opt.dataset.price) || 0;
  const name = opt.dataset.name || '';
  const descEl = document.getElementById('qb-item-desc-' + idx);
  const priceEl = document.getElementById('qb-item-price-' + idx);
  if (descEl) { descEl.value = name; quickBillItems[idx].description = name; }
  if (priceEl) { priceEl.value = price; quickBillItems[idx].unit_price = price; }
  calcQuickBillItemTotal(idx);
}

function onQuickBillSizeChange(idx) {
  const w = parseFloat(document.getElementById('qb-item-w-' + idx)?.value) || 0;
  const h = parseFloat(document.getElementById('qb-item-h-' + idx)?.value) || 0;
  quickBillItems[idx].width_inch = w;
  quickBillItems[idx].height_inch = h;
  const sqft = inchesToSqFt(w, h);
  quickBillItems[idx].sq_ft = sqft;
  const el = document.getElementById('qb-item-sqft-' + idx);
  if (el) el.textContent = sqft > 0 ? sqft.toFixed(3) + ' ft²' : '— ft²';
  calcQuickBillItemTotal(idx);
}

function onQuickBillPriceChange(idx) {
  quickBillItems[idx].unit_price = parseFloat(document.getElementById('qb-item-price-' + idx)?.value) || 0;
  calcQuickBillItemTotal(idx);
}

function onQuickBillQtyChange(idx) {
  quickBillItems[idx].quantity = parseInt(document.getElementById('qb-item-qty-' + idx)?.value) || 1;
  calcQuickBillItemTotal(idx);
}

function calcQuickBillItemTotal(idx) {
  const item = quickBillItems[idx];
  if (!item) return;
  const isSz = isSizeBasedItem(item);
  const total = isSz ? (item.sq_ft * item.unit_price) : ((item.quantity || 1) * item.unit_price);
  quickBillItems[idx].total_price = total;
  const el = document.getElementById('qb-item-total-' + idx);
  if (el) el.textContent = 'Rs. ' + (total > 0 ? Math.round(total).toLocaleString() : '—');
  calcQuickBillTotal();
}

function calcQuickBillTotal() {
  const subtotal = quickBillItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const discount = parseFloat(document.getElementById('qb-discount')?.value) || 0;
  const total = subtotal - discount;
  const paid = parseFloat(document.getElementById('qb-paid')?.value) || 0;
  const balance = total - paid;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('qb-subtotal', 'Rs. ' + Math.round(subtotal).toLocaleString());
  set('qb-discount-label', discount > 0 ? '— Rs. ' + Math.round(discount).toLocaleString() : 'No discount');
  set('qb-total', 'Rs. ' + Math.round(total).toLocaleString());
  set('qb-paid-label', 'Rs. ' + Math.round(paid).toLocaleString());
  set('qb-balance', 'Rs. ' + Math.round(Math.abs(balance)).toLocaleString());

  const balRow = document.getElementById('qb-balance-row');
  if (balRow) {
    balRow.className = 'summary-row ' + (balance > 0 ? 'total-balance' : 'total-clear');
    const balLabel = balRow.querySelector('span:first-child');
    if (balLabel) balLabel.textContent = balance > 0 ? 'Balance Due' : '✓ Fully Paid';
  }
}

async function submitQuickBill() {
  if (quickBillItems.length === 0) { showToast('Please add at least one manual item!', 'error'); return; }
  const badCustomCategory = quickBillItems.find(i => (i.is_custom_category || isCustomCategory(i.category)) && !(i.category || '').trim());
  if (badCustomCategory) { showToast('Please enter a custom category name!', 'error'); return; }
  const badCustomType = quickBillItems.find(i => getItemMeasureType(i) === 'custom' && !(i.custom_type_name || '').trim());
  if (badCustomType) { showToast('Please enter a custom type name!', 'error'); return; }
  const badPrice = quickBillItems.find(i => (parseFloat(i.unit_price) || 0) <= 0);
  if (badPrice) { showToast('Please enter price for all items!', 'error'); return; }
  const badSize = quickBillItems.find(i => isSizeBasedItem(i) && (!i.width_inch || !i.height_inch));
  if (badSize) { showToast('Please enter width & height for all size-based items!', 'error'); return; }

  const subtotal = quickBillItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const discount = parseFloat(document.getElementById('qb-discount')?.value) || 0;
  if (discount > subtotal) { showToast('Discount cannot be greater than subtotal!', 'error'); return; }

  const saleData = {
    customer_name: document.getElementById('qb-cust-name').value,
    customer_phone: document.getElementById('qb-cust-phone').value,
    sale_date: document.getElementById('qb-sale-date').value,
    notes: document.getElementById('qb-notes').value,
    discount: discount,
    paid_amount: parseFloat(document.getElementById('qb-paid')?.value) || 0,
    payment_method: document.getElementById('qb-payment-method')?.value || 'cash',
    items: quickBillItems.map(i => ({ ...i }))
  };

  try {
    const result = await window.shopAPI.saveSale(saleData);
    showToast('Manual bill ' + result.bill_no + ' saved successfully!', 'success');

    const shouldAutoSavePdf = !!document.getElementById('qb-auto-save-pdf')?.checked;
    if (shouldAutoSavePdf && !isAutoSavingQuickBillPdf) {
      try {
        isAutoSavingQuickBillPdf = true;
        await saveBillPdfForSale(result.sale_id, { openFolder: false, showProgress: false });
        showToast('Manual bill PDF saved in Documents/Abdullah Shop - Bills', 'success');
      } catch (pdfErr) {
        showToast('Bill saved, but PDF auto-save failed: ' + pdfErr.message, 'warning');
      } finally {
        isAutoSavingQuickBillPdf = false;
      }
    }

    resetQuickBillForm();
    setTimeout(() => viewBill(result.sale_id), 350);
  } catch (e) {
    showToast('Failed to save manual bill: ' + e.message, 'error');
  }
}

// ==================== HISTORY ====================
async function loadHistory(page) {
  page = page || 1; histPage = page;
  const search = document.getElementById('hist-search')?.value || '';
  const dateFrom = document.getElementById('hist-from')?.value || '';
  const dateTo = document.getElementById('hist-to')?.value || '';
  const tbody = document.getElementById('history-body');
  tbody.innerHTML = '<tr><td colspan="9" class="loading-state"><div class="loading-spinner"></div>Loading...</td></tr>';
  try {
    const data = await window.shopAPI.getSales({ page, limit: 20, search, dateFrom, dateTo });
    renderHistoryTable(data);
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="9" class="no-data">Error: ' + e.message + '</td></tr>';
  }
}

function renderHistoryTable(data) {
  const tbody = document.getElementById('history-body');
  if (!data.sales || data.sales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="no-data">
      <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      No sales found matching your search
    </td></tr>`;
    document.getElementById('history-pagination').innerHTML = ''; return;
  }
  tbody.innerHTML = data.sales.map(s => `
    <tr>
      <td><span class="badge badge-blue">${s.bill_no}</span></td>
      <td class="font-semibold">${s.customer_name || '<span class="text-muted">Walk-in</span>'}</td>
      <td class="text-muted">${s.customer_phone || '—'}</td>
      <td class="font-bold">${formatCurrency(s.total_amount)}</td>
      <td class="text-success font-semibold">${formatCurrency(s.paid_amount)}</td>
      <td class="${s.balance > 0 ? 'text-danger font-bold' : 'text-success font-semibold'}">${formatCurrency(s.balance)}</td>
      <td>${s.balance > 0 ? '<span class="chip-pending">Pending</span>' : '<span class="chip-paid">Paid</span>'}</td>
      <td class="text-muted">${formatDate(s.sale_date)}</td>
      <td>
        <div style="display:flex;gap:5px;">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="viewBill(${s.id})" title="View Invoice">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteSale(${s.id},'${s.bill_no}')" title="Delete">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
  renderPagination('history-pagination', data.page, Math.ceil(data.total / data.limit), loadHistory);
}

function renderPagination(containerId, curPage, totalPages, callback) {
  const el = document.getElementById(containerId);
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  let html = `<button class="page-btn" ${curPage === 1 ? 'disabled' : ''} onclick="${callback.name}(${curPage - 1})">&#8249;</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= curPage - 2 && i <= curPage + 2))
      html += `<button class="page-btn ${i === curPage ? 'active' : ''}" onclick="${callback.name}(${i})">${i}</button>`;
    else if (i === curPage - 3 || i === curPage + 3)
      html += `<span style="padding:0 4px;color:var(--muted)">···</span>`;
  }
  html += `<button class="page-btn" ${curPage === totalPages ? 'disabled' : ''} onclick="${callback.name}(${curPage + 1})">&#8250;</button>`;
  el.innerHTML = html;
}

function debounceHistSearch() {
  clearTimeout(histSearchTimer);
  histSearchTimer = setTimeout(() => loadHistory(1), 400);
}
function clearHistSearch() {
  document.getElementById('hist-search').value = '';
  document.getElementById('hist-from').value = '';
  document.getElementById('hist-to').value = '';
  loadHistory(1);
}

// ==================== BILL VIEW ====================
async function viewBill(saleId) {
  currentBillSaleId = saleId;
  try {
    const sale = await window.shopAPI.getSaleDetail(saleId);
    if (!sale) { showToast('Sale record not found!', 'error'); return; }
    document.getElementById('bill-content').innerHTML = generateBillHTML(sale, settings);
    document.getElementById('modal-bill-overlay').classList.add('open');
  } catch (e) { showToast('Error loading bill: ' + e.message, 'error'); }
}

function closeBillModal() {
  document.getElementById('modal-bill-overlay').classList.remove('open');
  currentBillSaleId = null;
}

async function doPrintBill() {
  if (!currentBillSaleId || isSavingBillPdf) return;
  const saveBtn = document.getElementById('bill-save-pdf-btn');
  try {
    isSavingBillPdf = true;
    if (saveBtn) saveBtn.disabled = true;
    await saveBillPdfForSale(currentBillSaleId, { openFolder: true, showProgress: true });
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    isSavingBillPdf = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function printBillPage() {
  if (!currentBillSaleId) return;
  const printBtn = document.getElementById('bill-print-btn');
  try {
    if (printBtn) printBtn.disabled = true;
    const sale = await window.shopAPI.getSaleDetail(currentBillSaleId);
    if (!sale) throw new Error('Bill record not found.');
    const html = generatePrintBillHTML(sale, settings);
    const win = window.open('', '_blank');
    win.document.documentElement.innerHTML = html;
    win.focus();
    win.onload = () => { win.print(); };
  } catch (e) {
    showToast('Print error: ' + e.message, 'error');
  } finally {
    if (printBtn) printBtn.disabled = false;
  }
}

async function saveBillPdfForSale(saleId, { openFolder = false, showProgress = true } = {}) {
  const sale = await window.shopAPI.getSaleDetail(saleId);
  if (!sale) throw new Error('Bill record not found.');
  const printHtml = generatePrintBillHTML(sale, settings);
  const filename = 'Bill_' + sale.bill_no + '_' + (sale.sale_date || new Date().toISOString().slice(0, 10)) + '.pdf';

  if (showProgress) showToast('Generating bill PDF...', 'info');
  const result = await window.shopAPI.savePDF({
    htmlContent: printHtml,
    filename: filename,
    subfolder: 'Abdullah Shop - Bills'
  });
  if (showProgress) showToast('Bill ' + sale.bill_no + ' PDF saved successfully!', 'success');
  if (openFolder) setTimeout(() => window.shopAPI.openFolder(result.dir), 600);
  return { sale, result };
}

function generateBillHTML(sale, shop) {
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;color:#1E293B;max-width:720px;margin:0 auto;">${_invoiceInnerHTML(sale, shop, false)}</div>`;
}

function _invoiceInnerHTML(sale, shop, forPrint) {
  const items = sale.items || [];
  const subtotal = Math.round(sale.total_amount) + Math.round(sale.discount || 0);
  const shopName = shop.shop_name || 'Abdullah Shop';
  const shopPhone = shop.shop_phone || '';
  const shopAddress = shop.shop_address || '';
  const services = (shop.shop_tagline || 'Sign Board|Flex|3D Board|Number Plates').split('|').map(s=>s.trim()).filter(Boolean);
  const isPaid = sale.balance <= 0;

  // Full logo SVG (with NAEEM HASSAN FLEX PRINTER text) for bill header
  const logoFullSVG = `<svg width="90" height="120" viewBox="0 0 100 133" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="47" fill="white" stroke="#ddd" stroke-width="1"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#E84030" transform="rotate(0 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#F07020" transform="rotate(45 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#F0C010" transform="rotate(90 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#80C020" transform="rotate(135 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#10B085" transform="rotate(180 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#40AACE" transform="rotate(225 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#6050C0" transform="rotate(270 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#B070C8" transform="rotate(315 50 50)"/>
    <path d="M14,20 A46,46 0 1,1 14,80" stroke="#3D1C72" stroke-width="7" fill="none" stroke-linecap="round"/>
    <text x="50" y="111" text-anchor="middle" font-size="11" font-weight="900" fill="#3D1C72" font-family="Georgia,Times New Roman,serif" letter-spacing="1">NAEEM HASSAN</text>
    <text x="50" y="125" text-anchor="middle" font-size="9" font-weight="700" fill="#3D1C72" font-family="Georgia,Times New Roman,serif" letter-spacing="2">FLEX PRINTER</text>
  </svg>`;

  // Small flower SVG (no text) for watermark
  const flowerSVG = (sz) => `<svg width="${sz}" height="${sz}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="47" fill="white"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#E84030" transform="rotate(0 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#F07020" transform="rotate(45 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#F0C010" transform="rotate(90 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#80C020" transform="rotate(135 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#10B085" transform="rotate(180 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#40AACE" transform="rotate(225 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#6050C0" transform="rotate(270 50 50)"/>
    <path d="M50,52 C41,41 39,18 50,12 C61,18 59,41 50,52Z" fill="#B070C8" transform="rotate(315 50 50)"/>
    <path d="M14,20 A46,46 0 1,1 14,80" stroke="#3D1C72" stroke-width="7" fill="none" stroke-linecap="round"/>
  </svg>`;

  const rows = items.map((item, i) => {
    const isSz = isSizeBasedItem(item);
    const bg = i % 2 === 0 ? '#fff' : '#FFF7ED';
    const h = isSz && item.height_inch > 0 ? item.height_inch : '';
    const w = isSz && item.width_inch > 0 ? item.width_inch : '';
    const sqft = item.sq_ft > 0 ? (item.sq_ft * (item.quantity || 1)).toFixed(1) : '';
    const qty = item.quantity || 1;
    const desc = item.description || getCategoryName(item.category);
    return `<tr style="background:${bg};">
      <td style="padding:7px 6px;border:1px solid #ddd;text-align:center;font-size:12px;color:#555;">${i+1}</td>
      <td style="padding:7px 10px;border:1px solid #ddd;font-size:12px;font-weight:500;">${desc}</td>
      <td style="padding:7px 6px;border:1px solid #ddd;text-align:center;font-size:12px;">${h}</td>
      <td style="padding:7px 6px;border:1px solid #ddd;text-align:center;font-size:12px;">${w}</td>
      <td style="padding:7px 6px;border:1px solid #ddd;text-align:center;font-size:12px;">${qty}</td>
      <td style="padding:7px 6px;border:1px solid #ddd;text-align:center;font-size:12px;font-weight:600;">${sqft}</td>
      <td style="padding:7px 8px;border:1px solid #ddd;text-align:right;font-size:12px;">${item.unit_price.toLocaleString()}</td>
      <td style="padding:7px 8px;border:1px solid #ddd;text-align:right;font-size:12px;font-weight:700;">${Math.round(item.total_price).toLocaleString()}</td>
    </tr>`;
  }).join('');

  const radius = forPrint ? '0' : '10px';

  return `
  <!-- HEADER -->
  <div style="background:#F97316;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-radius:${radius} ${radius} 0 0;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logoFullSVG}
      <div>
        <div style="font-size:24px;font-weight:900;color:#fff;letter-spacing:-0.5px;text-shadow:1px 1px 3px rgba(0,0,0,.25);">${shopName}</div>
        <div style="background:#1E3A8A;color:#fff;font-size:11px;font-weight:700;padding:2px 12px;border-radius:4px;display:inline-block;letter-spacing:.06em;margin-top:3px;">3D SIGNS</div>
      </div>
    </div>
    <div style="text-align:right;">
      ${services.map(s=>`<div style="color:#fff;font-size:11px;font-weight:600;line-height:1.95;">• ${s}</div>`).join('')}
    </div>
  </div>

  <!-- FROM MR + BILL INFO -->
  <div style="background:#fff;padding:9px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #F97316;">
    <div style="font-size:13px;">
      <span style="font-weight:700;">From Mr: </span>
      <span style="border-bottom:1px dotted #555;display:inline-block;min-width:200px;padding-bottom:1px;">${sale.customer_name || ''}</span>
      ${sale.customer_phone ? `&nbsp;&nbsp;<span style="font-size:12px;color:#666;">📞 ${sale.customer_phone}</span>` : ''}
    </div>
    <div style="text-align:right;font-size:12px;">
      <div style="font-weight:600;color:#333;">Bill No: <span style="color:#F97316;">${sale.bill_no}</span></div>
      <div style="color:#555;margin-top:2px;">Date: <strong>${formatDate(sale.sale_date)}</strong></div>
      <div style="margin-top:3px;"><span style="background:${isPaid?'#D1FAE5':'#FEF3C7'};color:${isPaid?'#065F46':'#92400E'};font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;">${isPaid?'✓ PAID':'PENDING'}</span></div>
    </div>
  </div>

  <!-- ITEMS TABLE with watermark -->
  <div style="position:relative;background:#fff;min-height:220px;">
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.055;pointer-events:none;">
      ${flowerSVG(280)}
    </div>
    <table style="width:100%;border-collapse:collapse;position:relative;z-index:1;">
      <thead>
        <tr style="background:#1E293B;">
          <th style="padding:8px 6px;font-size:11.5px;font-weight:700;color:#F97316;text-align:center;border:1px solid #334155;width:36px;">Sr. No</th>
          <th style="padding:8px 10px;font-size:11.5px;font-weight:700;color:#F97316;text-align:left;border:1px solid #334155;">Items Name</th>
          <th style="padding:8px 6px;font-size:11.5px;font-weight:700;color:#F97316;text-align:center;border:1px solid #334155;width:38px;">H</th>
          <th style="padding:8px 6px;font-size:11.5px;font-weight:700;color:#F97316;text-align:center;border:1px solid #334155;width:38px;">W</th>
          <th style="padding:8px 6px;font-size:11.5px;font-weight:700;color:#F97316;text-align:center;border:1px solid #334155;width:38px;">Qnt</th>
          <th style="padding:8px 6px;font-size:11.5px;font-weight:700;color:#F97316;text-align:center;border:1px solid #334155;width:50px;">Sqft</th>
          <th style="padding:8px 8px;font-size:11.5px;font-weight:700;color:#F97316;text-align:right;border:1px solid #334155;width:65px;">Rate</th>
          <th style="padding:8px 8px;font-size:11.5px;font-weight:700;color:#F97316;text-align:right;border:1px solid #334155;width:72px;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <!-- TOTALS + SIGNATURE -->
  <div style="background:#fff;display:flex;border-top:2px solid #F97316;">
    <div style="flex:1;padding:16px 20px;border-right:1px solid #E2E8F0;display:flex;align-items:flex-end;">
      <div style="font-size:11px;font-weight:700;color:#444;border-top:1px solid #333;padding-top:4px;min-width:140px;">Authorized Signature</div>
    </div>
    <div style="min-width:240px;">
      ${sale.discount > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #E2E8F0;font-size:13px;">
        <span style="color:#555;">Subtotal</span><span style="font-weight:600;">${subtotal.toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #E2E8F0;font-size:13px;">
        <span style="color:#DC2626;">Discount</span><span style="font-weight:600;color:#DC2626;">- ${Math.round(sale.discount).toLocaleString()}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #E2E8F0;font-size:13px;">
        <span>Total</span><span style="font-weight:700;">${Math.round(sale.total_amount).toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #E2E8F0;font-size:13px;">
        <span>Previous Bill</span><span style="font-weight:600;">${Math.round(sale.previous_balance || 0).toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #E2E8F0;font-size:13px;">
        <span>Advance</span><span style="font-weight:600;">${Math.round(sale.paid_amount).toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:9px 14px;font-size:14px;font-weight:800;background:#1E293B;color:#fff;">
        <span>Grand Total</span><span>${Math.round((sale.previous_balance || 0) + sale.balance).toLocaleString()}</span>
      </div>
    </div>
  </div>

  ${sale.notes ? `<div style="background:#FFF7ED;padding:7px 18px;border-top:1px solid #FED7AA;"><span style="font-size:10.5px;font-weight:700;color:#92400E;">Notes: </span><span style="font-size:12px;color:#78350F;">${sale.notes}</span></div>` : ''}

  <!-- FOOTER -->
  <div style="background:#F97316;padding:9px 18px;display:flex;justify-content:space-between;align-items:center;border-radius:0 0 ${radius} ${radius};">
    ${shopPhone ? `<div style="color:#fff;font-size:12px;font-weight:700;">📱 ${shopPhone}</div>` : '<div></div>'}
    ${shopAddress ? `<div style="color:#fff;font-size:12px;font-weight:700;">📍 ${shopAddress}</div>` : '<div></div>'}
  </div>`;
}

function generatePrintBillHTML(sale, shop) {
  const inner = _invoiceInnerHTML(sale, shop, true);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice ${sale.bill_no}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1E293B;}
    @media print{
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      @page{margin:12mm;}
    }
  </style></head><body>
  <div style="max-width:750px;margin:0 auto;border:1px solid #E2E8F0;border-radius:0;overflow:hidden;">
    ${inner}
  </div>
  </body></html>`;
}

// ==================== DELETE ====================
function confirmDeleteSale(id, billNo) {
  document.getElementById('confirm-msg').textContent = `Bill ${billNo} will be permanently deleted. This action cannot be undone.`;
  document.getElementById('confirm-yes-btn').onclick = () => doDeleteSale(id);
  document.getElementById('modal-confirm-overlay').classList.add('open');
}
function closeConfirm() { document.getElementById('modal-confirm-overlay').classList.remove('open'); }

function showConfirm(message, onConfirm) {
  document.getElementById('confirm-msg').textContent = message;
  document.getElementById('confirm-yes-btn').onclick = () => { closeConfirm(); onConfirm(); };
  document.getElementById('modal-confirm-overlay').classList.add('open');
}
async function doDeleteSale(id) {
  closeConfirm();
  try {
    await window.shopAPI.deleteSale(id);
    showToast('Sale deleted successfully.', 'success');
    loadHistory(histPage);
  } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
}

// ==================== REPORTS ====================
async function loadReport() {
  setupYearSelect();
  const month = document.getElementById('rep-month')?.value;
  const year = document.getElementById('rep-year')?.value;
  if (!month || !year) return;
  const el = document.getElementById('report-content');
  el.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div>Loading report...</div>';
  try {
    const data = await window.shopAPI.getMonthlyReport({ year, month });
    lastReportData = data;
    renderReport(data);
  } catch (e) { el.innerHTML = '<div class="no-data">Error: ' + e.message + '</div>'; }
}

function renderReport(data) {
  const { summary = {}, daily = [], catBreak = [], allSales = [], ym = '', khataSummary = {}, khataDaily = [], khataEntries = [] } = data || {};
  if (!ym) {
    document.getElementById('report-content').innerHTML = '<div class="no-data">Invalid report data.</div>';
    return;
  }
  const safeKhataSummary = {
    total_entries: parseFloat(khataSummary.total_entries) || 0,
    total_amount: parseFloat(khataSummary.total_amount) || 0,
    avg_amount: parseFloat(khataSummary.avg_amount) || 0
  };
  const [y, m] = ym.split('-');
  const monthName = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const el = document.getElementById('report-content');

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
      <div>
        <div style="font-size:20px;font-weight:800;color:var(--text);">${monthName}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:2px;">Complete breakdown of sales, revenue and sq. footage</div>
      </div>
    </div>

    <div class="report-summary-grid mb-5">
      <div class="summary-stat"><div class="ss-val">${summary.total_bills}</div><div class="ss-label">Total Invoices</div></div>
      <div class="summary-stat"><div class="ss-val">${formatCurrency(summary.total_revenue)}</div><div class="ss-label">Total Revenue</div></div>
      <div class="summary-stat"><div class="ss-val" style="color:var(--success);">${formatCurrency(summary.total_collected)}</div><div class="ss-label">Amount Collected</div></div>
      <div class="summary-stat"><div class="ss-val" style="color:var(--danger);">${formatCurrency(summary.total_pending)}</div><div class="ss-label">Outstanding Balance</div></div>
      <div class="summary-stat"><div class="ss-val" style="color:var(--purple);">${(summary.total_sq_ft || 0).toFixed(2)} ft²</div><div class="ss-label">Total Sq. Footage</div></div>
      <div class="summary-stat"><div class="ss-val" style="color:var(--warning);">${formatCurrency(summary.total_discount)}</div><div class="ss-label">Total Discounts</div></div>
      <div class="summary-stat"><div class="ss-val">${safeKhataSummary.total_entries}</div><div class="ss-label">Expense Entries</div></div>
      <div class="summary-stat"><div class="ss-val" style="color:var(--danger);">${formatCurrency(safeKhataSummary.total_amount)}</div><div class="ss-label">Monthly Expenses Total</div></div>
    </div>

    ${catBreak.length > 0 ? `
    <div class="divider-label" style="margin-bottom:14px;"><span>Category Breakdown</span></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
      ${catBreak.map(c => `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center;">
          <span class="badge ${getCategoryBadgeClass(c.category)}" style="margin-bottom:10px;display:inline-flex;">${getCategoryName(c.category)}</span>
          <div style="font-size:17px;font-weight:800;margin-bottom:4px;">${formatCurrency(c.revenue)}</div>
          <div class="text-sm text-muted">${c.cnt} items${c.sq_ft > 0 ? ' &bull; ' + c.sq_ft.toFixed(1) + ' ft²' : ''}</div>
        </div>`).join('')}
    </div>` : ''}

    ${daily.length > 0 ? `
    <div class="divider-label" style="margin-bottom:14px;"><span>Daily Breakdown</span></div>
    <div class="table-wrap mb-5">
      <table>
        <thead><tr><th>Date</th><th>Invoices</th><th>Revenue</th><th>Collected</th></tr></thead>
        <tbody>${daily.map(d => `<tr>
          <td class="font-semibold">${formatDate(d.sale_date)}</td>
          <td><span class="badge badge-blue">${d.bills}</span></td>
          <td class="font-bold">${formatCurrency(d.revenue)}</td>
          <td class="text-success font-semibold">${formatCurrency(d.collected)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : ''}

    ${khataDaily.length > 0 ? `
    <div class="divider-label" style="margin-bottom:14px;"><span>Daily Expenses (Day by Day)</span></div>
    <div class="table-wrap mb-5">
      <table>
        <thead><tr><th>Date</th><th>Expense Entries</th><th>Expenses Total</th></tr></thead>
        <tbody>${khataDaily.map(d => `<tr>
          <td class="font-semibold">${formatDate(d.entry_date)}</td>
          <td><span class="badge badge-blue">${d.total_entries || 0}</span></td>
          <td class="text-danger font-semibold">${formatCurrency(d.total_amount || 0)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : ''}

    ${khataEntries.length > 0 ? `
    <div class="divider-label" style="margin-bottom:14px;"><span>Expense Entries (${khataEntries.length})</span></div>
    <div class="table-wrap mb-5">
      <table>
        <thead><tr><th>Date</th><th>Time</th><th>Name / Item</th><th>Quantity</th><th>Amount</th><th>Notes</th></tr></thead>
        <tbody>${khataEntries.map(k => `<tr>
          <td class="font-semibold">${formatDate(k.entry_date)}</td>
          <td>${formatLedgerTime(k.entry_time)}</td>
          <td class="font-semibold">${escHtml(k.item_name || '—')}</td>
          <td>${escHtml(k.quantity_details || '—')}</td>
          <td class="text-danger font-semibold">${formatCurrency(k.amount || 0)}</td>
          <td class="text-muted">${escHtml(k.notes || '—')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : ''}

    ${allSales.length > 0 ? `
    <div class="divider-label" style="margin-bottom:14px;"><span>All Transactions (${allSales.length})</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Bill #</th><th>Customer</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th>Date</th><th></th></tr></thead>
        <tbody>${allSales.map(s => `<tr>
          <td><span class="badge badge-blue">${s.bill_no}</span></td>
          <td class="font-semibold">${s.customer_name || '<span class="text-muted">Walk-in</span>'}</td>
          <td class="font-bold">${formatCurrency(s.total_amount)}</td>
          <td class="text-success font-semibold">${formatCurrency(s.paid_amount)}</td>
          <td class="${s.balance > 0 ? 'text-danger font-bold' : 'text-success font-semibold'}">${formatCurrency(s.balance)}</td>
          <td>${s.balance > 0 ? '<span class="chip-pending">Pending</span>' : '<span class="chip-paid">Paid</span>'}</td>
          <td class="text-muted">${formatDate(s.sale_date)}</td>
          <td><button class="btn btn-ghost btn-sm btn-icon" onclick="viewBill(${s.id})">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : '<div class="empty-state" style="padding:32px;"><h4>No sales this month</h4><p>No transactions recorded for ' + monthName + '</p></div>'}`;
}

async function exportReportPDF() {
  if (!lastReportData) { showToast('Please load a report first!', 'error'); return; }
  const { summary, daily, catBreak, allSales, ym, khataSummary = {}, khataDaily = [], khataEntries = [] } = lastReportData;
  const [y, m] = ym.split('-');
  const monthName = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const shop = settings;
  const khataTotal = parseFloat(khataSummary.total_amount) || 0;
  const khataEntriesCount = parseFloat(khataSummary.total_entries) || 0;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;padding:24px;font-size:12px;color:#1E293B;}
  .hdr{text-align:center;padding-bottom:14px;border-bottom:3px solid #1E293B;margin-bottom:18px;}
  .sn{font-size:22px;font-weight:900;}.sub{font-size:11px;color:#64748B;margin-top:2px;}
  h1{font-size:17px;font-weight:800;margin-bottom:4px;}h2{font-size:13px;font-weight:700;margin:16px 0 8px;border-bottom:1px solid #E2E8F0;padding-bottom:5px;}
  .sg{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:16px;}
  .sc{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:7px;padding:12px;text-align:center;}
  .sv{font-size:16px;font-weight:800;}.sl{font-size:10px;color:#64748B;margin-top:2px;}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px;}
  th{background:#1E293B;color:#fff;padding:7px 9px;text-align:left;font-size:10px;text-transform:uppercase;}
  td{padding:6px 9px;border-bottom:1px solid #E2E8F0;}tr:nth-child(even)td{background:#F8FAFC;}
  .cg{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;}
  .cc{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:10px;text-align:center;}
  .ft{text-align:center;margin-top:18px;font-size:10px;color:#94A3B8;border-top:1px dashed #E2E8F0;padding-top:12px;}
  </style></head><body>
  <div class="hdr"><div class="sn">${shop.shop_name}</div><div class="sub">${shop.shop_tagline||''}</div><div class="sub">${shop.shop_address} | Tel: ${shop.shop_phone}</div></div>
  <h1>Monthly Report — ${monthName}</h1>
  <p style="font-size:11px;color:#64748B;margin-bottom:14px;">Generated on ${new Date().toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
  <div class="sg">
    <div class="sc"><div class="sv">${summary.total_bills}</div><div class="sl">Total Invoices</div></div>
    <div class="sc"><div class="sv">Rs. ${Math.round(summary.total_revenue).toLocaleString()}</div><div class="sl">Total Revenue</div></div>
    <div class="sc"><div class="sv" style="color:#059669;">Rs. ${Math.round(summary.total_collected).toLocaleString()}</div><div class="sl">Collected</div></div>
    <div class="sc"><div class="sv" style="color:#DC2626;">Rs. ${Math.round(summary.total_pending).toLocaleString()}</div><div class="sl">Pending</div></div>
    <div class="sc"><div class="sv" style="color:#7C3AED;">${(summary.total_sq_ft||0).toFixed(2)} ft²</div><div class="sl">Sq. Footage</div></div>
    <div class="sc"><div class="sv" style="color:#D97706;">Rs. ${Math.round(summary.total_discount).toLocaleString()}</div><div class="sl">Discounts</div></div>
    <div class="sc"><div class="sv">${Math.round(khataEntriesCount).toLocaleString()}</div><div class="sl">Expense Entries</div></div>
    <div class="sc"><div class="sv" style="color:#DC2626;">Rs. ${Math.round(khataTotal).toLocaleString()}</div><div class="sl">Expenses Total</div></div>
  </div>
  ${catBreak.length>0?`<h2>Category Breakdown</h2><div class="cg">${catBreak.map(c=>`<div class="cc"><div style="font-weight:700;font-size:11px;">${getCategoryName(c.category)}</div><div style="font-size:14px;font-weight:800;margin:4px 0;">Rs. ${Math.round(c.revenue).toLocaleString()}</div><div style="font-size:10px;color:#64748B;">${c.cnt} items${c.sq_ft>0?' &bull; '+c.sq_ft.toFixed(1)+'ft²':''}</div></div>`).join('')}</div>`:''}
  ${daily.length>0?`<h2>Daily Breakdown</h2><table><thead><tr><th>Date</th><th>Invoices</th><th>Revenue</th><th>Collected</th></tr></thead><tbody>${daily.map(d=>`<tr><td>${formatDate(d.sale_date)}</td><td>${d.bills}</td><td>Rs. ${Math.round(d.revenue).toLocaleString()}</td><td>Rs. ${Math.round(d.collected).toLocaleString()}</td></tr>`).join('')}</tbody></table>`:''}
  ${khataDaily.length>0?`<h2>Daily Expenses (Day by Day)</h2><table><thead><tr><th>Date</th><th>Entries</th><th>Expenses Total</th></tr></thead><tbody>${khataDaily.map(d=>`<tr><td>${formatDate(d.entry_date)}</td><td>${d.total_entries||0}</td><td>Rs. ${Math.round(d.total_amount||0).toLocaleString()}</td></tr>`).join('')}</tbody></table>`:''}
  ${khataEntries.length>0?`<h2>Expense Entries</h2><table><thead><tr><th>Date</th><th>Time</th><th>Name / Item</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>${khataEntries.map(k=>`<tr><td>${formatDate(k.entry_date)}</td><td>${formatLedgerTime(k.entry_time)}</td><td>${escHtml(k.item_name||'')}</td><td>${escHtml(k.quantity_details||'')}</td><td>Rs. ${Math.round(k.amount||0).toLocaleString()}</td></tr>`).join('')}</tbody></table>`:''}
  ${allSales.length>0?`<h2>All Transactions</h2><table><thead><tr><th>Bill #</th><th>Customer</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Date</th></tr></thead><tbody>${allSales.map(s=>`<tr><td>${s.bill_no}</td><td>${s.customer_name||'Walk-in'}</td><td>Rs. ${Math.round(s.total_amount).toLocaleString()}</td><td>Rs. ${Math.round(s.paid_amount).toLocaleString()}</td><td style="${s.balance>0?'color:#DC2626;font-weight:700':'color:#059669'}">Rs. ${Math.round(s.balance).toLocaleString()}</td><td>${formatDate(s.sale_date)}</td></tr>`).join('')}</tbody></table>`:''}
  <div class="ft">Report generated by ${shop.shop_name} Management System &bull; ${new Date().toLocaleString('en-US')}</div>
  </body></html>`;

  const filename = 'Report_' + monthName.replace(/\s+/g, '_') + '.pdf';
  try {
    showToast('Exporting PDF, please wait...', 'info');
    const result = await window.shopAPI.savePDF({ htmlContent: html, filename });
    showToast('PDF saved to Documents/Abdullah Shop - Reports/', 'success');
    setTimeout(() => window.shopAPI.openFolder(result.dir), 800);
  } catch (e) { showToast('PDF export failed: ' + e.message, 'error'); }
}

// ==================== PROFIT / LOSS ====================
function getCurrentTimeValue() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function setupProfitLossForm() {
  const dateEl = document.getElementById('pl-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
  setupDailyKhataForm();
  syncPLFormEditState();
  calcPLQuickTotal();
}

function switchPLTab(tab) {
  document.querySelectorAll('.pl-tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.pl-tab-btn').forEach(el => {
    el.style.color = 'rgba(255,255,255,0.7)';
    el.style.borderBottomColor = 'transparent';
  });

  if (tab === 'daily-khata') {
    document.getElementById('tab-daily-khata').style.display = 'block';
    document.querySelectorAll('.pl-tab-btn')[0].style.color = '#fff';
    document.querySelectorAll('.pl-tab-btn')[0].style.borderBottomColor = '#fff';
  } else {
    document.getElementById('tab-product-ledger').style.display = 'block';
    document.querySelectorAll('.pl-tab-btn')[1].style.color = '#fff';
    document.querySelectorAll('.pl-tab-btn')[1].style.borderBottomColor = '#fff';
  }
}

function onProfitLossFilterChange() {
  loadProfitLoss();
}

function syncPLFormEditState() {
  const saveBtn = document.getElementById('pl-save-btn');
  const cancelBtn = document.getElementById('pl-cancel-edit-btn');
  if (!saveBtn || !cancelBtn) return;
  if (plEditingId) {
    saveBtn.classList.remove('btn-success');
    saveBtn.classList.add('btn-warning');
    saveBtn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>Update Entry`;
    cancelBtn.style.display = 'inline-flex';
  } else {
    saveBtn.classList.remove('btn-warning');
    saveBtn.classList.add('btn-success');
    saveBtn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Save Daily Entry`;
    cancelBtn.style.display = 'none';
  }
}

function calcPLQuickTotal() {
  const expense = parseFloat(document.getElementById('pl-expense-input')?.value) || 0;
  const amount  = parseFloat(document.getElementById('pl-amount-input')?.value) || 0;
  const diff    = amount - expense;
  const el = document.getElementById('pl-quick-total');
  if (!el) return;
  el.textContent = (diff >= 0 ? '+ ' : '- ') + formatCurrency(Math.abs(diff));
  el.style.color = diff >= 0 ? 'var(--success)' : 'var(--danger)';
}

function resetPLQuickForm() {
  plEditingId = null;
  const dateEl = document.getElementById('pl-date');
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
  const categoryEl = document.getElementById('pl-category');
  const customCatEl = document.getElementById('pl-custom-category');
  if (categoryEl) { categoryEl.value = ''; }
  if (customCatEl) { customCatEl.style.display = 'none'; customCatEl.value = ''; }
  const productEl = document.getElementById('pl-product');
  const expenseEl = document.getElementById('pl-expense-input');
  const amountEl = document.getElementById('pl-amount-input');
  const notesEl = document.getElementById('pl-notes');
  if (productEl) productEl.value = '';
  if (expenseEl) expenseEl.value = '';
  if (amountEl) amountEl.value = '';
  if (notesEl) notesEl.value = '';
  syncPLFormEditState();
  calcPLQuickTotal();
}

function cancelProfitLossEdit() {
  resetPLQuickForm();
  showToast('Edit mode cancelled.', 'info');
}

function onPLCategoryChange() {
  const categoryEl = document.getElementById('pl-category');
  const customCatEl = document.getElementById('pl-custom-category');
  if (!categoryEl || !customCatEl) return;

  if (categoryEl.value === '__add_custom__') {
    categoryEl.value = '';
    customCatEl.style.display = 'block';
    customCatEl.focus();
  } else {
    customCatEl.style.display = 'none';
    customCatEl.value = '';
  }
}

function onPLCustomCategoryInput() {
  const customCatEl = document.getElementById('pl-custom-category');
  if (!customCatEl) return;
  // Category will be set from this field when saving
}

function setupDailyKhataForm() {
  if (dailyKhataEditingId) {
    syncDailyKhataEditState();
    return;
  }
  const dateEl = document.getElementById('khata-date');
  const timeEl = document.getElementById('khata-time');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
  if (timeEl && !timeEl.value) timeEl.value = getCurrentTimeValue();
  syncDailyKhataEditState();
}

function syncDailyKhataEditState() {
  const saveBtn = document.getElementById('khata-save-btn');
  const cancelBtn = document.getElementById('khata-cancel-edit-btn');
  if (!saveBtn || !cancelBtn) return;
  if (dailyKhataEditingId) {
    saveBtn.classList.remove('btn-success');
    saveBtn.classList.add('btn-warning');
    saveBtn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>Update Expense Entry`;
    cancelBtn.style.display = 'inline-flex';
  } else {
    saveBtn.classList.remove('btn-warning');
    saveBtn.classList.add('btn-success');
    saveBtn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Save Expense Entry`;
    cancelBtn.style.display = 'none';
  }
}

function resetDailyKhataForm() {
  dailyKhataEditingId = null;
  const dateEl = document.getElementById('khata-date');
  const timeEl = document.getElementById('khata-time');
  const itemEl = document.getElementById('khata-item-name');
  const qtyEl = document.getElementById('khata-quantity-details');
  const amountEl = document.getElementById('khata-amount');
  const notesEl = document.getElementById('khata-notes');

  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
  if (timeEl) timeEl.value = getCurrentTimeValue();
  if (itemEl) itemEl.value = '';
  if (qtyEl) qtyEl.value = '';
  if (amountEl) amountEl.value = '';
  if (notesEl) notesEl.value = '';
  syncDailyKhataEditState();
}

function cancelDailyKhataEdit() {
  resetDailyKhataForm();
  showToast('Edit cancelled.', 'info');
}

async function editDailyKhataEntry(id) {
  const targetId = Number(id);
  try {
    let row = dailyKhataRowsCache.find(r => Number(r.id) === targetId);
    if (!row) {
      const dateFrom = document.getElementById('pl-from')?.value || '';
      const dateTo = document.getElementById('pl-to')?.value || '';
      const rows = await window.shopAPI.getDailyKhataEntries({ dateFrom, dateTo });
      dailyKhataRowsCache = Array.isArray(rows) ? rows : [];
      row = dailyKhataRowsCache.find(r => Number(r.id) === targetId);
    }
    if (!row) { showToast('Expense entry not found.', 'error'); return; }
    dailyKhataEditingId = targetId;
    const dateEl = document.getElementById('khata-date');
    const timeEl = document.getElementById('khata-time');
    const itemEl = document.getElementById('khata-item-name');
    const qtyEl = document.getElementById('khata-quantity-details');
    const amountEl = document.getElementById('khata-amount');
    const notesEl = document.getElementById('khata-notes');
    if (dateEl) dateEl.value = row.entry_date || new Date().toISOString().slice(0, 10);
    if (timeEl) timeEl.value = (row.entry_time || getCurrentTimeValue()).slice(0, 5);
    if (itemEl) itemEl.value = row.item_name || '';
    if (qtyEl) qtyEl.value = row.quantity_details || '';
    if (amountEl) amountEl.value = String(parseFloat(row.amount) || 0);
    if (notesEl) notesEl.value = row.notes || '';
    syncDailyKhataEditState();
    const content = document.getElementById('content');
    if (content) content.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => itemEl?.focus(), 250);
    showToast('Edit mode enabled.', 'info');
  } catch (e) {
    showToast('Load failed: ' + e.message, 'error');
  }
}

async function saveDailyKhataEntry() {
  const entry_date = document.getElementById('khata-date')?.value?.trim() || new Date().toISOString().slice(0, 10);
  const entry_time = (document.getElementById('khata-time')?.value || getCurrentTimeValue()).slice(0, 5);
  const item_name = document.getElementById('khata-item-name')?.value?.trim();
  const quantity_details = document.getElementById('khata-quantity-details')?.value?.trim() || '';
  const amount = parseFloat(document.getElementById('khata-amount')?.value) || 0;
  const notes = document.getElementById('khata-notes')?.value || '';

  if (!entry_date) { showToast('Please enter expense date.', 'error'); return; }
  if (!item_name) { showToast('Please enter item/name.', 'error'); return; }
  if (amount <= 0) { showToast('Please enter valid amount.', 'error'); return; }

  try {
    if (dailyKhataEditingId) {
      await window.shopAPI.updateDailyKhataEntry({ id: dailyKhataEditingId, entry_date, entry_time, item_name, quantity_details, amount, notes });
      showToast('Expense entry updated!', 'success');
    } else {
      await window.shopAPI.addDailyKhataEntry({ entry_date, entry_time, item_name, quantity_details, amount, notes });
      showToast('Expense entry saved!', 'success');
    }
    resetDailyKhataForm();
    await loadDailyKhata();
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
  }
}

async function loadDailyKhata() {
  const tbody = document.getElementById('daily-khata-table-body');
  if (!tbody) return;
  const dateFrom = document.getElementById('pl-from')?.value || '';
  const dateTo = document.getElementById('pl-to')?.value || '';

  try {
    const summary = await window.shopAPI.getDailyKhataSummary({ dateFrom, dateTo });
    const totalAmount = parseFloat(summary.total_amount) || 0;
    const totalEntries = parseFloat(summary.total_entries) || 0;
    const avgAmount = parseFloat(summary.avg_amount) || 0;
    const lastDate = summary.last_entry_date ? formatDate(summary.last_entry_date) : '—';
    const totalEl = document.getElementById('khata-total-amount');
    const entriesEl = document.getElementById('khata-total-entries');
    const avgEl = document.getElementById('khata-avg-amount');
    const lastEl = document.getElementById('khata-last-date');
    if (totalEl) totalEl.textContent = formatCurrency(totalAmount);
    if (entriesEl) entriesEl.textContent = Math.round(totalEntries).toLocaleString('en-PK');
    if (avgEl) avgEl.textContent = formatCurrency(avgAmount);
    if (lastEl) lastEl.textContent = lastDate;
  } catch (_) {}

  dailyKhataRowsCache = [];
  tbody.innerHTML = '<tr><td colspan="7" class="loading-state"><div class="loading-spinner"></div>Loading...</td></tr>';
  try {
    const rows = await window.shopAPI.getDailyKhataEntries({ dateFrom, dateTo });
    dailyKhataRowsCache = Array.isArray(rows) ? rows : [];
    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="no-data">No daily expense entries found</td></tr>';
      return;
    }
    tbody.innerHTML = (() => {
      let runningTotal = 0;
      return rows.map(r => {
        runningTotal += (r.amount || 0);
        return `
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:10px;text-align:left;font-size:13px;font-weight:600;color:#0066cc;">${formatDate(r.entry_date)}</td>
            <td style="padding:10px;text-align:left;font-size:12px;color:#666;">${formatLedgerTime(r.entry_time)}</td>
            <td style="padding:10px;text-align:left;font-size:13px;font-weight:600;">${escHtml(r.item_name || '—')}</td>
            <td style="padding:10px;text-align:left;font-size:12px;color:#666;">${escHtml(r.quantity_details || '—')}</td>
            <td style="padding:10px;text-align:right;font-size:13px;font-weight:600;color:#dd0000;">Rs. ${Math.round(r.amount || 0).toLocaleString('en-PK')}</td>
            <td style="padding:10px;text-align:right;font-size:13px;font-weight:700;color:#0066cc;background:#f0f5ff;border-left:2px solid #0066cc;">Rs. ${Math.round(runningTotal).toLocaleString('en-PK')}</td>
            <td style="padding:10px;text-align:left;font-size:11px;color:#999;">${escHtml(r.notes || '—')}</td>
            <td style="padding:10px;text-align:center;">
              <button class="btn btn-outline-primary btn-sm btn-icon" onclick="editDailyKhataEntry(${r.id})" title="Edit" style="width:28px;height:28px;">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
              </button>
              <button class="btn btn-danger btn-sm btn-icon" onclick="deleteDailyKhataEntry(${r.id})" title="Delete" style="width:28px;height:28px;">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    })();
  } catch (e) {
    dailyKhataRowsCache = [];
    tbody.innerHTML = '<tr><td colspan="7" class="no-data">Error: ' + e.message + '</td></tr>';
  }
  loadDailyLedgerSummary();
}

async function loadDailyLedgerSummary() {
  const dateEl = document.getElementById('khata-date');
  const today = dateEl?.value || new Date().toISOString().slice(0, 10);
  const kamayaTbody = document.getElementById('summary-kamaya-tbody');
  const useHogaTbody = document.getElementById('summary-usehoga-tbody');
  if (!kamayaTbody && !useHogaTbody) return;
  try {
    const [kamayaRows, useHogaRows] = await Promise.all([
      window.shopAPI.getProductBills({ dateFrom: today, dateTo: today }),
      window.shopAPI.getDailyKhataEntries({ dateFrom: today, dateTo: today })
    ]);
    const totalKamaya = (kamayaRows || []).reduce((s, r) => s + (parseFloat(r.sale_price) || 0), 0);
    const totalUseHoga = (useHogaRows || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const net = totalKamaya - totalUseHoga;
    if (kamayaTbody) {
      if (!kamayaRows?.length) {
        kamayaTbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:#bbb;padding:10px;font-size:11px;">No entries</td></tr>';
      } else {
        kamayaTbody.innerHTML = kamayaRows.map((r, i) => `<tr>
          <td style="padding:5px 8px;border-bottom:1px solid #f0fdf4;font-size:12px;">${i+1}. ${escHtml(r.product_name || '—')}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #f0fdf4;text-align:right;font-weight:600;color:#059669;font-size:12px;">Rs. ${Math.round(parseFloat(r.sale_price)||0).toLocaleString('en-PK')}</td>
        </tr>`).join('');
      }
      const ktEl = document.getElementById('summary-kamaya-total');
      if (ktEl) ktEl.textContent = `Rs. ${Math.round(totalKamaya).toLocaleString('en-PK')}`;
    }
    if (useHogaTbody) {
      if (!useHogaRows?.length) {
        useHogaTbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:#bbb;padding:10px;font-size:11px;">No entries</td></tr>';
      } else {
        useHogaTbody.innerHTML = useHogaRows.map((r, i) => `<tr>
          <td style="padding:5px 8px;border-bottom:1px solid #fef2f2;font-size:12px;">${i+1}. ${escHtml(r.item_name || '—')}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #fef2f2;text-align:right;font-weight:600;color:#DC2626;font-size:12px;">Rs. ${Math.round(parseFloat(r.amount)||0).toLocaleString('en-PK')}</td>
        </tr>`).join('');
      }
      const utEl = document.getElementById('summary-usehoga-total');
      if (utEl) utEl.textContent = `Rs. ${Math.round(totalUseHoga).toLocaleString('en-PK')}`;
    }
    const netEl = document.getElementById('summary-net-total');
    if (netEl) {
      netEl.textContent = `Rs. ${Math.round(Math.abs(net)).toLocaleString('en-PK')}`;
      netEl.style.color = net >= 0 ? '#059669' : '#DC2626';
    }
    const formulaEl = document.getElementById('summary-net-formula');
    if (formulaEl) {
      formulaEl.innerHTML = `<span style="color:${net>=0?'#059669':'#DC2626'};font-weight:700;">${net >= 0 ? 'Faida' : 'Nuqsan'}</span><br>Rs. ${Math.round(totalKamaya).toLocaleString('en-PK')} − Rs. ${Math.round(totalUseHoga).toLocaleString('en-PK')}`;
    }
    const d = new Date(today);
    const dateLabel = document.getElementById('summary-date-label');
    if (dateLabel) dateLabel.textContent = d.toLocaleDateString('en-PK', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    console.warn('Summary load error:', e);
  }
}

async function deleteDailyKhataEntry(id) {
  try {
    await window.shopAPI.deleteDailyKhataEntry(id);
    showToast('Expense entry deleted.', 'success');
    if (dailyKhataEditingId === Number(id)) resetDailyKhataForm();
    await loadDailyKhata();
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'error');
  }
}

async function editProfitLossEntry(id) {
  const targetId = Number(id);
  try {
    let row = profitLossRowsCache.find(r => Number(r.id) === targetId);
    if (!row) {
      const dateFrom = document.getElementById('pl-from')?.value || '';
      const dateTo   = document.getElementById('pl-to')?.value   || '';
      const rows = await window.shopAPI.getProductBills({ dateFrom, dateTo });
      profitLossRowsCache = Array.isArray(rows) ? rows : [];
      row = profitLossRowsCache.find(r => Number(r.id) === targetId);
    }
    if (!row && typeof window.shopAPI.getProductBill === 'function') {
      row = await window.shopAPI.getProductBill(targetId);
    }
    if (!row) { showToast('Record not found.', 'error'); return; }
    plEditingId = targetId;
    const dateEl = document.getElementById('pl-date');
    const categoryEl = document.getElementById('pl-category');
    const customCatEl = document.getElementById('pl-custom-category');
    const productEl = document.getElementById('pl-product');
    const expenseEl = document.getElementById('pl-expense-input');
    const amountEl = document.getElementById('pl-amount-input');
    const notesEl = document.getElementById('pl-notes');
    if (dateEl) dateEl.value = row.sale_date || new Date().toISOString().slice(0, 10);

    // Populate category
    const fixedCats = ['flex', '3d_signboard', 'qatba_plate', 'number_plate', 'stiker'];
    const cat = row.category || '';
    if (categoryEl) {
      if (fixedCats.includes(cat)) {
        categoryEl.value = cat;
        if (customCatEl) { customCatEl.style.display = 'none'; customCatEl.value = ''; }
      } else if (cat) {
        categoryEl.value = '';
        if (customCatEl) { customCatEl.style.display = 'block'; customCatEl.value = cat; }
      } else {
        categoryEl.value = '';
        if (customCatEl) { customCatEl.style.display = 'none'; customCatEl.value = ''; }
      }
    }

    if (productEl) productEl.value = row.product_name || '';
    if (expenseEl) expenseEl.value = String((parseFloat(row.quantity) || 1) * (parseFloat(row.cost_price) || 0));
    if (amountEl) amountEl.value = String((parseFloat(row.quantity) || 1) * (parseFloat(row.sale_price) || 0));
    if (notesEl) notesEl.value = row.notes || '';
    syncPLFormEditState();
    calcPLQuickTotal();
    const content = document.getElementById('content');
    if (content) content.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => productEl?.focus(), 250);
    showToast('Edit mode enabled. Update the values and press Update Entry.', 'info');
  } catch (e) {
    showToast('Edit load fail: ' + e.message, 'error');
  }
}

async function saveProfitLossEntry() {
  const sale_date = document.getElementById('pl-date')?.value?.trim() || new Date().toISOString().slice(0, 10);
  const categoryEl = document.getElementById('pl-category');
  const customCatEl = document.getElementById('pl-custom-category');
  let category = categoryEl?.value?.trim() || '';
  if (!category && customCatEl?.style.display !== 'none') {
    category = customCatEl?.value?.trim() || '';
  }
  const product_name = document.getElementById('pl-product')?.value?.trim();
  const cost_price = parseFloat(document.getElementById('pl-expense-input')?.value) || 0;
  const sale_price = parseFloat(document.getElementById('pl-amount-input')?.value) || 0;
  const notes = document.getElementById('pl-notes')?.value || '';

  if (!product_name) { showToast('Enter a product name!', 'error'); return; }
  if (cost_price <= 0 && sale_price <= 0) { showToast('Enter at least one value: expense or total amount!', 'error'); return; }

  try {
    if (plEditingId) {
      const payload = { id: plEditingId, sale_date, category, product_name, quantity: 1, cost_price, sale_price, notes };
      let updated = false;
      if (typeof window.shopAPI.updateProductBill === 'function') {
        try {
          await window.shopAPI.updateProductBill(payload);
          updated = true;
        } catch (e) {
          const msg = String(e?.message || e || '');
          if (!msg.includes('No handler registered')) throw e;
        }
      }
      if (!updated) {
        // Fallback for old running main process: replace old record with new values
        await window.shopAPI.deleteProductBill(plEditingId);
        await window.shopAPI.addProductBill({ sale_date, category, product_name, quantity: 1, cost_price, sale_price, notes });
      }
      showToast('Daily ledger entry updated!', 'success');
    } else {
      await window.shopAPI.addProductBill({ sale_date, category, product_name, quantity: 1, cost_price, sale_price, notes });
      showToast('Daily ledger entry saved!', 'success');
    }
    resetPLQuickForm();
    await loadProfitLoss();
  } catch (e) {
    showToast('Save fail: ' + e.message, 'error');
  }
}

async function loadProfitLoss() {
  const dateFrom = document.getElementById('pl-from')?.value || '';
  const dateTo   = document.getElementById('pl-to')?.value   || '';

  await loadDailyKhata();

  try {
    const summary = await window.shopAPI.getProfitLossSummary({ dateFrom, dateTo });
    const netProfit = summary.net_profit || 0;
    document.getElementById('pl-revenue').textContent    = formatCurrency(summary.total_revenue);
    document.getElementById('pl-expense').textContent    = formatCurrency(summary.total_expense);
    document.getElementById('pl-records').textContent    = summary.total_records;
    const netEl = document.getElementById('pl-net-profit');
    netEl.textContent = formatCurrency(Math.abs(netProfit));
    netEl.style.color = netProfit >= 0 ? 'var(--success)' : 'var(--danger)';
    netEl.closest('.stat-card').querySelector('.stat-label').textContent = netProfit >= 0 ? 'Net Profit' : 'Net Loss';
  } catch(e) {}

  // Table with filter
  const tbody = document.getElementById('pl-table-body');
  profitLossRowsCache = [];
  tbody.innerHTML = '<tr><td colspan="8" class="loading-state"><div class="loading-spinner"></div>Loading...</td></tr>';
  try {
    const rows = await window.shopAPI.getProductBills({ dateFrom, dateTo });
    profitLossRowsCache = Array.isArray(rows) ? rows : [];
    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="no-data">No records found</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const totalCost    = (r.quantity * r.cost_price);
      const totalRevenue = (r.quantity * r.sale_price);
      const pl           = totalRevenue - totalCost;
      const isProfit     = pl >= 0;
      const catName = getCategoryName(r.category) || '—';
      return `<tr>
        <td class="font-semibold">${formatDate(r.sale_date)}</td>
        <td><span class="badge ${getCategoryBadgeClass(r.category)}">${escHtml(catName)}</span></td>
        <td class="font-semibold">${escHtml(r.product_name)}</td>
        <td class="text-danger font-semibold">${formatCurrency(totalCost)}</td>
        <td class="text-success font-semibold">${formatCurrency(totalRevenue)}</td>
        <td>
          <span style="font-weight:800;color:${isProfit ? 'var(--success)' : 'var(--danger)'};">
            ${isProfit ? '+' : '-'} ${formatCurrency(Math.abs(pl))}
          </span>
          <span class="badge ${isProfit ? 'badge-green' : 'badge-red'}" style="margin-left:5px;font-size:10px;">${isProfit ? 'Profit' : 'Loss'}</span>
        </td>
        <td class="text-muted">${escHtml(r.notes || '—')}</td>
        <td>
          <button class="btn btn-outline-primary btn-sm btn-icon" onclick="editProfitLossEntry(${r.id})" title="Edit">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="deletePBRecord(${r.id})" title="Delete">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {
    profitLossRowsCache = [];
    tbody.innerHTML = '<tr><td colspan="8" class="no-data">Error: ' + e.message + '</td></tr>';
  }
}

function clearPLFilter() {
  const f = document.getElementById('pl-from');
  const t = document.getElementById('pl-to');
  if (f) f.value = '';
  if (t) t.value = '';
  onProfitLossFilterChange();
}

// ==================== PRODUCT BILLS ====================
async function loadProductBillsPage() {
  setupProductBillDate();
  await loadProductBillsList();
}

async function loadProductBillsList() {
  const search    = document.getElementById('pb-search')?.value    || '';
  const dateFrom  = document.getElementById('pb-filter-from')?.value || '';
  const dateTo    = document.getElementById('pb-filter-to')?.value   || '';
  const tbody = document.getElementById('pb-list-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="10" class="loading-state"><div class="loading-spinner"></div>Loading...</td></tr>';
  try {
    const rows = await window.shopAPI.getProductBills({ search, dateFrom, dateTo });
    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="no-data">No bills found</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const totalCost    = r.quantity * r.cost_price;
      const totalRevenue = r.quantity * r.sale_price;
      const pl           = totalRevenue - totalCost;
      const isProfit     = pl >= 0;
      return `<tr>
        <td class="font-semibold">${formatDate(r.sale_date)}</td>
        <td class="font-semibold">${escHtml(r.product_name)}</td>
        <td>${r.quantity}</td>
        <td class="text-muted">${formatCurrency(r.cost_price)}</td>
        <td class="text-muted">${formatCurrency(r.sale_price)}</td>
        <td class="text-danger font-semibold">${formatCurrency(totalCost)}</td>
        <td class="text-success font-semibold">${formatCurrency(totalRevenue)}</td>
        <td><span style="font-weight:800;color:${isProfit ? 'var(--success)' : 'var(--danger)'};">${isProfit ? '+' : '-'}${formatCurrency(Math.abs(pl))}</span>
          <span class="badge ${isProfit ? 'badge-green' : 'badge-red'}" style="font-size:10px;margin-left:4px;">${isProfit ? 'Profit' : 'Loss'}</span>
        </td>
        <td class="text-muted">${escHtml(r.notes || '—')}</td>
        <td>
          <button class="btn btn-danger btn-sm btn-icon" onclick="deletePBRecord(${r.id})" title="Delete">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="10" class="no-data">Error: ' + e.message + '</td></tr>';
  }
}

function calcPBTotal() {
  const qty    = parseFloat(document.getElementById('pb-qty')?.value)  || 0;
  const cost   = parseFloat(document.getElementById('pb-cost')?.value) || 0;
  const sale   = parseFloat(document.getElementById('pb-sale')?.value) || 0;
  const preview = document.getElementById('pb-preview');
  if (!preview) return;
  if (qty > 0 && (cost > 0 || sale > 0)) {
    const totalCost    = qty * cost;
    const totalRevenue = qty * sale;
    const pl           = totalRevenue - totalCost;
    const isProfit     = pl >= 0;
    document.getElementById('pb-prev-cost').textContent    = formatCurrency(totalCost);
    document.getElementById('pb-prev-revenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('pb-prev-pl').textContent      = formatCurrency(Math.abs(pl));
    document.getElementById('pb-prev-pl').style.color      = isProfit ? 'var(--success)' : 'var(--danger)';
    document.getElementById('pb-prev-label').textContent   = isProfit ? 'Profit' : 'Loss';
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
}

async function saveProductBill() {
  const sale_date    = document.getElementById('pb-date')?.value?.trim();
  const product_name = document.getElementById('pb-product')?.value?.trim();
  const quantity     = parseFloat(document.getElementById('pb-qty')?.value) || 0;
  const cost_price   = parseFloat(document.getElementById('pb-cost')?.value) || 0;
  const sale_price   = parseFloat(document.getElementById('pb-sale')?.value) || 0;
  const notes        = document.getElementById('pb-notes')?.value || '';

  if (!sale_date)    { showToast('Enter a date!', 'error'); return; }
  if (!product_name) { showToast('Enter product name!', 'error'); return; }
  if (quantity <= 0) { showToast('Enter a valid quantity!', 'error'); return; }

  try {
    await window.shopAPI.addProductBill({ sale_date, product_name, quantity, cost_price, sale_price, notes });
    showToast('Bill saved successfully!', 'success');
    document.getElementById('pb-product').value = '';
    document.getElementById('pb-qty').value = '1';
    document.getElementById('pb-cost').value = '';
    document.getElementById('pb-sale').value = '';
    document.getElementById('pb-notes').value = '';
    document.getElementById('pb-preview').style.display = 'none';
    await loadProductBillsList();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function deletePBRecord(id) {
  try {
    await window.shopAPI.deleteProductBill(id);
    showToast('Record deleted successfully.', 'success');
    if (plEditingId === id) resetPLQuickForm();
    if (currentPage === 'profit-loss') loadProfitLoss();
  } catch(e) { showToast('Delete fail: ' + e.message, 'error'); }
}

function clearPBFilter() {
  const s = document.getElementById('pb-search');
  const f = document.getElementById('pb-filter-from');
  const t = document.getElementById('pb-filter-to');
  if (s) s.value = '';
  if (f) f.value = '';
  if (t) t.value = '';
  loadProductBillsList();
}

// ==================== DAILY REPORTS ====================
async function loadDailyReport() {
  const dateEl = document.getElementById('daily-rep-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
  const date = dateEl?.value;
  if (!date) return;
  const el = document.getElementById('daily-report-content');
  el.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div>Loading report...</div>';
  try {
    const data = await window.shopAPI.getDailyReport({ date });
    lastDailyReportData = data;
    renderDailyReport(data);
  } catch (e) { el.innerHTML = '<div class="no-data">Error: ' + e.message + '</div>'; }
}

function renderDailyReport(data) {
  const { summary = {}, catBreak = [], allSales = [], date, khataSummary = {}, khataEntries = [] } = data || {};
  const safeKhataSummary = {
    total_entries: parseFloat(khataSummary.total_entries) || 0,
    total_amount: parseFloat(khataSummary.total_amount) || 0,
    avg_amount: parseFloat(khataSummary.avg_amount) || 0
  };
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const el = document.getElementById('daily-report-content');

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
      <div>
        <div style="font-size:20px;font-weight:800;color:var(--text);">${dateLabel}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:2px;">Complete sales, revenue, and sq. footage for this day</div>
      </div>
    </div>

    <div class="report-summary-grid mb-5">
      <div class="summary-stat"><div class="ss-val">${summary.total_bills}</div><div class="ss-label">Total Invoices</div></div>
      <div class="summary-stat"><div class="ss-val">${formatCurrency(summary.total_revenue)}</div><div class="ss-label">Total Revenue</div></div>
      <div class="summary-stat"><div class="ss-val" style="color:var(--success);">${formatCurrency(summary.total_collected)}</div><div class="ss-label">Amount Collected</div></div>
      <div class="summary-stat"><div class="ss-val" style="color:var(--danger);">${formatCurrency(summary.total_pending)}</div><div class="ss-label">Outstanding Balance</div></div>
      <div class="summary-stat"><div class="ss-val" style="color:var(--purple);">${(summary.total_sq_ft || 0).toFixed(2)} ft²</div><div class="ss-label">Total Sq. Footage</div></div>
      <div class="summary-stat"><div class="ss-val" style="color:var(--warning);">${formatCurrency(summary.total_discount)}</div><div class="ss-label">Total Discounts</div></div>
      <div class="summary-stat"><div class="ss-val">${safeKhataSummary.total_entries}</div><div class="ss-label">Expense Entries</div></div>
      <div class="summary-stat"><div class="ss-val" style="color:var(--danger);">${formatCurrency(safeKhataSummary.total_amount)}</div><div class="ss-label">Daily Expenses Total</div></div>
    </div>

    ${catBreak.length > 0 ? `
    <div class="divider-label" style="margin-bottom:14px;"><span>Category Breakdown</span></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
      ${catBreak.map(c => `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center;">
          <span class="badge ${getCategoryBadgeClass(c.category)}" style="margin-bottom:10px;display:inline-flex;">${getCategoryName(c.category)}</span>
          <div style="font-size:17px;font-weight:800;margin-bottom:4px;">${formatCurrency(c.revenue)}</div>
          <div class="text-sm text-muted">${c.cnt} items${c.sq_ft > 0 ? ' &bull; ' + c.sq_ft.toFixed(1) + ' ft²' : ''}</div>
        </div>`).join('')}
    </div>` : ''}

    ${khataEntries.length > 0 ? `
    <div class="divider-label" style="margin-bottom:14px;"><span>Daily Expense Entries (${khataEntries.length})</span></div>
    <div class="table-wrap mb-5">
      <table>
        <thead><tr><th>Time</th><th>Name / Item</th><th>Quantity</th><th>Amount</th><th>Notes</th></tr></thead>
        <tbody>${khataEntries.map(k => `<tr>
          <td>${formatLedgerTime(k.entry_time)}</td>
          <td class="font-semibold">${escHtml(k.item_name || '—')}</td>
          <td>${escHtml(k.quantity_details || '—')}</td>
          <td class="text-danger font-semibold">${formatCurrency(k.amount || 0)}</td>
          <td class="text-muted">${escHtml(k.notes || '—')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : ''}

    ${allSales.length > 0 ? `
    <div class="divider-label" style="margin-bottom:14px;"><span>All Transactions for This Day (${allSales.length})</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Bill #</th><th>Customer</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
        <tbody>${allSales.map(s => `<tr>
          <td><span class="badge badge-blue">${s.bill_no}</span></td>
          <td class="font-semibold">${s.customer_name || '<span class="text-muted">Walk-in</span>'}</td>
          <td class="font-bold">${formatCurrency(s.total_amount)}</td>
          <td class="text-success font-semibold">${formatCurrency(s.paid_amount)}</td>
          <td class="${s.balance > 0 ? 'text-danger font-bold' : 'text-success font-semibold'}">${formatCurrency(s.balance)}</td>
          <td>${s.balance > 0 ? '<span class="chip-pending">Pending</span>' : '<span class="chip-paid">Paid</span>'}</td>
          <td><button class="btn btn-ghost btn-sm btn-icon" onclick="viewBill(${s.id})">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : '<div class="empty-state" style="padding:32px;"><h4>No Sales Found</h4><p>No transactions were recorded for this day</p></div>'}`;
}

async function exportDailyReportPDF() {
  if (!lastDailyReportData) { showToast('Please load the report first!', 'error'); return; }
  const { summary, catBreak, allSales, date, khataSummary = {}, khataEntries = [] } = lastDailyReportData;
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shop = settings;
  const khataTotal = parseFloat(khataSummary.total_amount) || 0;
  const khataEntriesCount = parseFloat(khataSummary.total_entries) || 0;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;padding:24px;font-size:12px;color:#1E293B;}
  .hdr{text-align:center;padding-bottom:14px;border-bottom:3px solid #1E293B;margin-bottom:18px;}
  .sn{font-size:22px;font-weight:900;}.sub{font-size:11px;color:#64748B;margin-top:2px;}
  h1{font-size:17px;font-weight:800;margin-bottom:4px;}h2{font-size:13px;font-weight:700;margin:16px 0 8px;border-bottom:1px solid #E2E8F0;padding-bottom:5px;}
  .sg{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:16px;}
  .sc{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:7px;padding:12px;text-align:center;}
  .sv{font-size:16px;font-weight:800;}.sl{font-size:10px;color:#64748B;margin-top:2px;}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px;}
  th{background:#1E293B;color:#fff;padding:7px 9px;text-align:left;font-size:10px;text-transform:uppercase;}
  td{padding:6px 9px;border-bottom:1px solid #E2E8F0;}tr:nth-child(even)td{background:#F8FAFC;}
  .cg{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;}
  .cc{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:10px;text-align:center;}
  .ft{text-align:center;margin-top:18px;font-size:10px;color:#94A3B8;border-top:1px dashed #E2E8F0;padding-top:12px;}
  </style></head><body>
  <div class="hdr"><div class="sn">${shop.shop_name}</div><div class="sub">${shop.shop_tagline||''}</div><div class="sub">${shop.shop_address} | Tel: ${shop.shop_phone}</div></div>
  <h1>Daily Report — ${dateLabel}</h1>
  <p style="font-size:11px;color:#64748B;margin-bottom:14px;">Generated on ${new Date().toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
  <div class="sg">
    <div class="sc"><div class="sv">${summary.total_bills}</div><div class="sl">Total Invoices</div></div>
    <div class="sc"><div class="sv">Rs. ${Math.round(summary.total_revenue).toLocaleString()}</div><div class="sl">Total Revenue</div></div>
    <div class="sc"><div class="sv" style="color:#059669;">Rs. ${Math.round(summary.total_collected).toLocaleString()}</div><div class="sl">Collected</div></div>
    <div class="sc"><div class="sv" style="color:#DC2626;">Rs. ${Math.round(summary.total_pending).toLocaleString()}</div><div class="sl">Pending</div></div>
    <div class="sc"><div class="sv" style="color:#7C3AED;">${(summary.total_sq_ft||0).toFixed(2)} ft²</div><div class="sl">Sq. Footage</div></div>
    <div class="sc"><div class="sv" style="color:#D97706;">Rs. ${Math.round(summary.total_discount).toLocaleString()}</div><div class="sl">Discounts</div></div>
    <div class="sc"><div class="sv">${Math.round(khataEntriesCount).toLocaleString()}</div><div class="sl">Expense Entries</div></div>
    <div class="sc"><div class="sv" style="color:#DC2626;">Rs. ${Math.round(khataTotal).toLocaleString()}</div><div class="sl">Expenses Total</div></div>
  </div>
  ${catBreak.length>0?`<h2>Category Breakdown</h2><div class="cg">${catBreak.map(c=>`<div class="cc"><div style="font-weight:700;font-size:11px;">${getCategoryName(c.category)}</div><div style="font-size:14px;font-weight:800;margin:4px 0;">Rs. ${Math.round(c.revenue).toLocaleString()}</div><div style="font-size:10px;color:#64748B;">${c.cnt} items${c.sq_ft>0?' &bull; '+c.sq_ft.toFixed(1)+'ft²':''}</div></div>`).join('')}</div>`:''}
  ${khataEntries.length>0?`<h2>Daily Expense Entries</h2><table><thead><tr><th>Time</th><th>Name / Item</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>${khataEntries.map(k=>`<tr><td>${formatLedgerTime(k.entry_time)}</td><td>${escHtml(k.item_name||'')}</td><td>${escHtml(k.quantity_details||'')}</td><td>Rs. ${Math.round(k.amount||0).toLocaleString()}</td></tr>`).join('')}</tbody></table>`:''}
  ${allSales.length>0?`<h2>All Transactions</h2><table><thead><tr><th>Bill #</th><th>Customer</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>${allSales.map(s=>`<tr><td>${s.bill_no}</td><td>${s.customer_name||'Walk-in'}</td><td>Rs. ${Math.round(s.total_amount).toLocaleString()}</td><td>Rs. ${Math.round(s.paid_amount).toLocaleString()}</td><td style="${s.balance>0?'color:#DC2626;font-weight:700':'color:#059669'}">Rs. ${Math.round(s.balance).toLocaleString()}</td><td>${s.balance>0?'Pending':'Paid'}</td></tr>`).join('')}</tbody></table>`:''}
  <div class="ft">Report generated by ${shop.shop_name} Management System &bull; ${new Date().toLocaleString('en-US')}</div>
  </body></html>`;

  const filename = 'Daily_Report_' + date + '.pdf';
  try {
    showToast('Exporting PDF, please wait...', 'info');
    const result = await window.shopAPI.savePDF({ htmlContent: html, filename });
    showToast('PDF saved — Documents/Abdullah Shop - Reports/', 'success');
    setTimeout(() => window.shopAPI.openFolder(result.dir), 800);
  } catch (e) { showToast('PDF export fail: ' + e.message, 'error'); }
}

// ==================== PRODUCTS ====================
async function loadProductsPage() {
  await loadProductsCache();
  renderProductsTable();
}

function renderProductsTable() {
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;
  if (productsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="no-data">
      <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      No products found — add one using the form above
    </td></tr>`;
    return;
  }
  tbody.innerHTML = productsList.map((p, i) => `
    <tr>
      <td class="text-muted">${i + 1}</td>
      <td class="font-semibold">${escHtml(p.name)}</td>
      <td><span class="badge ${getCategoryBadgeClass(p.category)}">${getCategoryName(p.category)}</span></td>
      <td class="font-bold">${formatCurrency(p.unit_price)}</td>
      <td class="text-muted">${p.created_at ? p.created_at.slice(0, 10) : '—'}</td>
      <td>
        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteProduct(${p.id})" title="Delete">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </td>
    </tr>`).join('');
}

async function saveProduct() {
  const name = document.getElementById('prod-name')?.value?.trim();
  const category = document.getElementById('prod-category')?.value;
  const unit_price = parseFloat(document.getElementById('prod-price')?.value) || 0;
  if (!name) { showToast('Enter product name!', 'error'); return; }
  try {
    await window.shopAPI.saveProduct({ name, category, unit_price });
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-price').value = '';
    showToast('Product added successfully!', 'success');
    await loadProductsCache();
    renderProductsTable();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function deleteProduct(id) {
  try {
    await window.shopAPI.deleteProduct(id);
    showToast('Product deleted successfully.', 'success');
    await loadProductsCache();
    renderProductsTable();
  } catch (e) { showToast('Delete fail: ' + e.message, 'error'); }
}

// ==================== OWNER LEDGER ====================
function resetOwnerEntryForm() {
  ownerEditingId = null;
  ownerEditingOriginalKind = null;
  const ownerEl = document.getElementById('owner-owner');
  const ownerCustomEl = document.getElementById('owner-custom-name');
  const dateEl = document.getElementById('owner-date');
  const kindEl = document.getElementById('owner-kind');
  const amountEl = document.getElementById('owner-amount');
  const notesEl = document.getElementById('owner-notes');
  const linkedEl = document.getElementById('owner-linked');
  const saveBtn = document.getElementById('owner-save-btn');
  const updateBtn = document.getElementById('owner-update-btn');
  const cancelBtn = document.getElementById('owner-cancel-btn');
  if (ownerEl) ownerEl.value = OWNER_NAMES[0];
  if (ownerCustomEl) ownerCustomEl.value = '';
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
  if (kindEl) kindEl.value = 'withdraw';
  if (kindEl) kindEl.disabled = false;
  if (amountEl) amountEl.value = '';
  if (notesEl) notesEl.value = '';
  if (linkedEl) linkedEl.innerHTML = '<option value="">Select linked withdrawal</option>';
  if (saveBtn) saveBtn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Save Owner Entry`;
  if (updateBtn) updateBtn.style.display = 'none';
  if (cancelBtn) cancelBtn.style.display = 'none';
  syncOwnerEntryKindUI();
}

async function loadOwnerLedgerPage() {
  if (!document.getElementById('owner-date')?.value) {
    document.getElementById('owner-date').value = new Date().toISOString().slice(0, 10);
  }
  if (!document.getElementById('owner-owner')?.value) {
    document.getElementById('owner-owner').value = OWNER_NAMES[0];
  }
  resetOwnerEntryForm();
  await loadOwnerLedger();
}

function getSelectedOwnerName() {
  const ownerEl = document.getElementById('owner-owner');
  if (!ownerEl) return '';
  if (ownerEl.value !== OWNER_CUSTOM_VALUE) return ownerEl.value || '';
  return document.getElementById('owner-custom-name')?.value?.trim() || '';
}

function onOwnerCustomInput() {
  const kind = document.getElementById('owner-kind')?.value || 'withdraw';
  if (kind === 'return') loadOwnerWithdrawalOptions();
}

function syncOwnerEntryKindUI() {
  const kindEl = document.getElementById('owner-kind');
  const wrapEl = document.getElementById('owner-linked-wrap');
  const ownerEl = document.getElementById('owner-owner');
  const ownerCustomEl = document.getElementById('owner-custom-name');
  if (!kindEl || !wrapEl) return;
  const isReturn = kindEl.value === 'return';
  const isCustomOwner = (ownerEl?.value || '') === OWNER_CUSTOM_VALUE;
  wrapEl.style.display = isReturn ? '' : 'none';
  if (ownerCustomEl) {
    ownerCustomEl.style.display = isCustomOwner ? '' : 'none';
    if (!isCustomOwner) ownerCustomEl.value = '';
  }
  if (isReturn) loadOwnerWithdrawalOptions();
}

async function loadOwnerWithdrawalOptions(keepWithdrawalId = null) {
  const linkedEl = document.getElementById('owner-linked');
  if (!linkedEl) return;
  const kind = document.getElementById('owner-kind')?.value || 'withdraw';
  const selectedOwner = kind === 'return' ? '' : getSelectedOwnerName();
  const ownerValue = document.getElementById('owner-owner')?.value || '';
  if (kind !== 'return' && ownerValue === OWNER_CUSTOM_VALUE && !selectedOwner) {
    linkedEl.innerHTML = '<option value="">Enter custom owner name first</option>';
    return;
  }
  const keepId = keepWithdrawalId ? Number(keepWithdrawalId) : null;
  try {
    const rows = await window.shopAPI.getOwnerWithdrawals({ ownerName: selectedOwner });
    const openRows = (rows || []).filter(r => {
      const id = Number(r.id);
      const balance = parseFloat(r.balance_amount) || 0;
      return balance > 0.00001 || (keepId && id === keepId);
    });
    linkedEl.innerHTML = '<option value="">Select linked withdrawal</option>' + openRows.map(r => {
      const label = `${r.owner_name} | ${r.txn_date} | Remaining: ${formatCurrency(r.balance_amount)}`;
      return `<option value="${r.id}">${escHtml(label)}</option>`;
    }).join('');
  } catch (e) {
    linkedEl.innerHTML = '<option value="">Failed to load withdrawals</option>';
  }
}

async function saveOwnerEntry() {
  const ownerName = getSelectedOwnerName();
  const txnDate = document.getElementById('owner-date')?.value || '';
  const txnKind = document.getElementById('owner-kind')?.value || 'withdraw';
  const amount = parseFloat(document.getElementById('owner-amount')?.value) || 0;
  const linkedEl = document.getElementById('owner-linked');
  let linkedWithdrawalId = linkedEl?.value || '';
  const notes = document.getElementById('owner-notes')?.value || '';

  if (!ownerName && txnKind === 'withdraw') { showToast('Please select owner or enter custom owner name.', 'error'); return; }
  if (!txnDate) { showToast('Please enter date.', 'error'); return; }
  if (amount <= 0) { showToast('Please enter a valid amount.', 'error'); return; }
  if (txnKind === 'return' && !linkedWithdrawalId) {
    // Auto-pick first available linked withdrawal if user forgets to select.
    const firstOpt = linkedEl?.querySelector('option[value]:not([value=""])');
    if (firstOpt?.value) {
      linkedWithdrawalId = firstOpt.value;
      if (linkedEl) linkedEl.value = firstOpt.value;
    }
  }
  if (txnKind === 'return' && !linkedWithdrawalId) {
    showToast('No linked withdrawal found. Add a withdrawal entry first, then add return.', 'error');
    return;
  }

  const payload = {
    owner_name: ownerName,
    txn_date: txnDate,
    txn_kind: txnKind,
    amount,
    linked_withdrawal_id: linkedWithdrawalId ? Number(linkedWithdrawalId) : null,
    notes
  };

  try {
    const res = await window.shopAPI.saveOwnerEntry(payload);
    if (!res?.success) throw new Error('Save response was invalid.');
    const savedId = Number(res.id || 0);
    showToast('Owner entry saved successfully!', 'success');
    resetOwnerEntryForm();
    await loadOwnerLedger();

    // If filters hide the just-saved row, clear filters and reload so user can see it.
    if (savedId > 0 && !ownerRowsCache.some(r => Number(r.id) === savedId)) {
      const ownerFilterEl = document.getElementById('owner-filter-name');
      const fromEl = document.getElementById('owner-filter-from');
      const toEl = document.getElementById('owner-filter-to');
      if (ownerFilterEl) ownerFilterEl.value = '';
      if (fromEl) fromEl.value = '';
      if (toEl) toEl.value = '';
      await loadOwnerLedger();
      showToast('Filters were cleared to show the latest saved owner entry.', 'info');
    }
  } catch (e) {
    showToast('Owner entry failed: ' + e.message, 'error');
  }
}

async function applyOwnerUpdate() {
  if (!ownerEditingId) {
    showToast('No entry selected for update. Use edit button first.', 'warning');
    return;
  }
  const ownerName = getSelectedOwnerName();
  const txnDate = document.getElementById('owner-date')?.value || '';
  const txnKind = document.getElementById('owner-kind')?.value || 'withdraw';
  const amount = parseFloat(document.getElementById('owner-amount')?.value) || 0;
  const linkedWithdrawalId = document.getElementById('owner-linked')?.value || '';
  const notes = document.getElementById('owner-notes')?.value || '';

  if (!ownerName && txnKind === 'withdraw') { showToast('Please select owner or enter custom owner name.', 'error'); return; }
  if (!txnDate) { showToast('Please enter date.', 'error'); return; }
  if (amount <= 0) { showToast('Please enter a valid amount.', 'error'); return; }
  if (ownerEditingOriginalKind && ownerEditingOriginalKind !== txnKind) {
    showToast('Entry type cannot be changed in edit mode. Cancel and create a new entry.', 'warning');
    return;
  }
  if (txnKind === 'return' && !linkedWithdrawalId) {
    showToast('Please select linked withdrawal for return.', 'error');
    return;
  }
  if (!window.confirm('Update this existing owner entry?')) return;

  const payload = {
    id: ownerEditingId,
    owner_name: ownerName,
    txn_date: txnDate,
    txn_kind: txnKind,
    amount,
    linked_withdrawal_id: linkedWithdrawalId ? Number(linkedWithdrawalId) : null,
    notes
  };

  try {
    const res = await window.shopAPI.updateOwnerEntry(payload);
    if (!res?.success) throw new Error('Update response was invalid.');
    showToast('Owner entry updated successfully!', 'success');
    resetOwnerEntryForm();
    await loadOwnerLedger();
  } catch (e) {
    showToast('Update failed: ' + e.message, 'error');
  }
}

async function editOwnerEntry(id) {
  const entry = ownerRowsCache.find(r => Number(r.id) === Number(id));
  if (!entry) { showToast('Owner entry not found.', 'error'); return; }
  ownerEditingId = Number(id);
  ownerEditingOriginalKind = entry.txn_kind || null;

  const ownerEl = document.getElementById('owner-owner');
  const ownerCustomEl = document.getElementById('owner-custom-name');
  const dateEl = document.getElementById('owner-date');
  const kindEl = document.getElementById('owner-kind');
  const amountEl = document.getElementById('owner-amount');
  const notesEl = document.getElementById('owner-notes');
  const saveBtn = document.getElementById('owner-save-btn');
  const updateBtn = document.getElementById('owner-update-btn');
  const cancelBtn = document.getElementById('owner-cancel-btn');

  const entryOwner = (entry.owner_name || '').trim();
  if (ownerEl) {
    if (entryOwner && OWNER_NAMES.includes(entryOwner)) {
      ownerEl.value = entryOwner;
      if (ownerCustomEl) ownerCustomEl.value = '';
    } else {
      ownerEl.value = OWNER_CUSTOM_VALUE;
      if (ownerCustomEl) ownerCustomEl.value = entryOwner;
    }
  }
  if (dateEl) dateEl.value = entry.txn_date || new Date().toISOString().slice(0, 10);
  if (kindEl) kindEl.value = entry.txn_kind || 'withdraw';
  if (kindEl) kindEl.disabled = true;
  if (amountEl) amountEl.value = String(entry.amount || '');
  if (notesEl) notesEl.value = entry.notes || '';

  syncOwnerEntryKindUI();
  if ((entry.txn_kind || '') === 'return') {
    await loadOwnerWithdrawalOptions(entry.linked_withdrawal_id);
    const linkedEl = document.getElementById('owner-linked');
    if (linkedEl) linkedEl.value = String(entry.linked_withdrawal_id || '');
  }

  if (saveBtn) saveBtn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Save Owner Entry`;
  if (updateBtn) updateBtn.style.display = 'inline-flex';
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
  showToast('Edit mode enabled. Use "Update Owner Entry" to modify, or "Save Owner Entry" for a new row.', 'info');

  const content = document.getElementById('content');
  if (content) content.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelOwnerEdit() {
  resetOwnerEntryForm();
  showToast('Owner edit cancelled.', 'info');
}

async function deleteOwnerEntry(id) {
  const entry = ownerRowsCache.find(r => Number(r.id) === Number(id));
  const msg = entry ? `Delete ${entry.txn_kind} entry of ${entry.owner_name} (${formatCurrency(entry.amount)})?` : 'Delete this owner entry?';
  if (!window.confirm(msg)) return;
  try {
    await window.shopAPI.deleteOwnerEntry(id);
    if (ownerEditingId === Number(id)) resetOwnerEntryForm();
    showToast('Owner entry deleted.', 'success');
    await loadOwnerLedger();
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'error');
  }
}

async function loadOwnerLedger() {
  const ownerName = document.getElementById('owner-filter-name')?.value || '';
  const dateFrom = document.getElementById('owner-filter-from')?.value || '';
  const dateTo = document.getElementById('owner-filter-to')?.value || '';
  const tbody = document.getElementById('owner-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="9" class="loading-state"><div class="loading-spinner"></div>Loading...</td></tr>';
  try {
    const data = await window.shopAPI.getOwnerLedger({ ownerName, dateFrom, dateTo });
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const ledgerByWithdrawal = new Map();
    rows.forEach(r => {
      if (r.txn_kind === 'withdraw') {
        const key = Number(r.id);
        ledgerByWithdrawal.set(key, {
          taken: parseFloat(r.amount) || 0,
          returned: 0
        });
      }
    });
    rows.forEach(r => {
      if (r.txn_kind === 'return' && r.linked_withdrawal_id) {
        const key = Number(r.linked_withdrawal_id);
        const current = ledgerByWithdrawal.get(key) || {
          taken: parseFloat(r.linked_withdrawal_amount) || 0,
          returned: 0
        };
        current.returned += (parseFloat(r.amount) || 0);
        ledgerByWithdrawal.set(key, current);
      }
    });
    const viewRows = rows.map(r => {
      const rootId = r.txn_kind === 'withdraw' ? Number(r.id) : Number(r.linked_withdrawal_id || 0);
      const agg = ledgerByWithdrawal.get(rootId) || { taken: parseFloat(r.amount) || 0, returned: 0 };
      const remaining = (agg.taken || 0) - (agg.returned || 0);
      return {
        ...r,
        taken_amount: agg.taken || 0,
        returned_amount: agg.returned || 0,
        remaining_amount: remaining
      };
    });
    ownerRowsCache = viewRows;

    document.getElementById('owner-total-withdraw').textContent = formatCurrency(data?.summary?.total_withdraw || 0);
    document.getElementById('owner-total-return').textContent = formatCurrency(data?.summary?.total_return || 0);
    document.getElementById('owner-net-outstanding').textContent = formatCurrency(data?.summary?.net_outstanding || 0);

    if (viewRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="no-data">No owner entries found</td></tr>';
      return;
    }

    tbody.innerHTML = viewRows.map(r => `
      <tr>
        <td class="font-semibold">${formatDate(r.group_date)}</td>
        <td>${escHtml(r.owner_name || '—')}</td>
        <td>${r.txn_kind === 'withdraw' ? '<span class="badge badge-red">Withdrawal</span>' : '<span class="badge badge-green">Return</span>'}</td>
        <td class="font-semibold">${formatCurrency(r.taken_amount)}</td>
        <td class="font-semibold">${formatCurrency(r.taken_amount)}</td>
        <td class="text-success font-semibold">${formatCurrency(r.returned_amount)}</td>
        <td class="${(r.remaining_amount || 0) > 0 ? 'text-danger' : 'text-success'} font-semibold">${formatCurrency(r.remaining_amount)}</td>
        <td class="text-muted">${escHtml(r.notes || '—')}</td>
        <td>
          <button class="btn btn-outline-primary btn-sm btn-icon" onclick="editOwnerEntry(${r.id})" title="Edit">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="deleteOwnerEntry(${r.id})" title="Delete">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="9" class="no-data">Error: ' + e.message + '</td></tr>';
  }
}

function clearOwnerLedgerFilters() {
  const ownerEl = document.getElementById('owner-filter-name');
  const fromEl = document.getElementById('owner-filter-from');
  const toEl = document.getElementById('owner-filter-to');
  if (ownerEl) ownerEl.value = '';
  if (fromEl) fromEl.value = '';
  if (toEl) toEl.value = '';
  loadOwnerLedger();
}

// ==================== ACCOUNTS ====================
function getAccountMethodAmount(method) {
  const key = String(method || '').trim().toLowerCase();
  return parseFloat(accountPaymentSummary?.[key]) || 0;
}

function formatMethodAmount(amount) {
  const n = Math.round(amount || 0);
  const sign = n < 0 ? '-' : '';
  return sign + Math.abs(n).toLocaleString('en-PK');
}

function buildAccountMethodOptionLabel(method) {
  const base = formatPaymentMethodLabel(method);
  return `${base} (${formatMethodAmount(getAccountMethodAmount(method))})`;
}

function buildMethodSummaryFromRows(rows = []) {
  const summary = { cash: 0, jazzcash: 0, easypaisa: 0, bank_account: 0 };
  (rows || []).forEach(r => {
    const method = String(r?.payment_method || '').trim().toLowerCase();
    const key = (method === 'jazzcash' || method === 'easypaisa' || method === 'bank_account') ? method : 'cash';
    const amount = parseFloat(r?.amount) || 0;
    summary[key] += (r?.entry_type === 'expense' ? -amount : amount);
  });
  return summary;
}

function renderAccountMethodSelects(preferredMethod = '') {
  const methods = ['cash', 'jazzcash', 'easypaisa', 'bank_account'];
  const methodEl = document.getElementById('acc-method');
  const filterEl = document.getElementById('acc-method-filter');

  if (methodEl) {
    const current = preferredMethod || methodEl.value || 'cash';
    methodEl.innerHTML = methods.map(m => `<option value="${m}">${escHtml(buildAccountMethodOptionLabel(m))}</option>`).join('');
    methodEl.value = methods.includes(current) ? current : 'cash';
  }

  if (filterEl) {
    const currentFilter = filterEl.value || '';
    filterEl.innerHTML = `<option value="">All Methods</option>${methods.map(m => `<option value="${m}">${escHtml(buildAccountMethodOptionLabel(m))}</option>`).join('')}`;
    filterEl.value = (currentFilter && methods.includes(currentFilter)) ? currentFilter : '';
  }
}

function renderAccountBankOptions(selectedBank = '') {
  const bankEl = document.getElementById('acc-bank');
  if (!bankEl) return;
  let options = '<option value="">Select Bank Account</option>';
  options += accountBankList.map(name => `<option value="${escHtml(name)}">${escHtml(name)}</option>`).join('');
  bankEl.innerHTML = options;
  if (selectedBank) {
    const match = accountBankList.find(n => n.toLowerCase() === String(selectedBank).toLowerCase());
    if (match) bankEl.value = match;
    else {
      const opt = document.createElement('option');
      opt.value = selectedBank;
      opt.textContent = selectedBank;
      bankEl.appendChild(opt);
      bankEl.value = selectedBank;
    }
  }
}

function syncAccountBankUI() {
  const method = document.getElementById('acc-method')?.value || 'cash';
  const bankWrap = document.getElementById('acc-bank-wrap');
  if (bankWrap) bankWrap.style.display = method === 'bank_account' ? 'block' : 'none';
}

async function addBankAccountName() {
  const inputEl = document.getElementById('acc-bank-new');
  const name = inputEl?.value?.trim() || '';
  if (!name) { showToast('Enter bank name first.', 'warning'); return; }
  try {
    const list = await window.shopAPI.saveBankAccount(name);
    accountBankList = Array.isArray(list) ? list : [];
    renderAccountBankOptions(name);
    if (inputEl) inputEl.value = '';
    showToast('Bank account added successfully!', 'success');
  } catch (e) {
    showToast('Failed to add bank: ' + e.message, 'error');
  }
}

async function refreshAccountsMeta() {
  let summaryLoaded = false;
  try {
    const summary = await window.shopAPI.getAccountPaymentSummary();
    accountPaymentSummary = {
      cash: parseFloat(summary?.cash) || 0,
      jazzcash: parseFloat(summary?.jazzcash) || 0,
      easypaisa: parseFloat(summary?.easypaisa) || 0,
      bank_account: parseFloat(summary?.bank_account) || 0
    };
    summaryLoaded = true;
  } catch (_) {
    summaryLoaded = false;
  }

  if (!summaryLoaded) {
    try {
      const fallback = await window.shopAPI.getAccountTransactions({});
      accountPaymentSummary = buildMethodSummaryFromRows(fallback?.rows || []);
      summaryLoaded = true;
    } catch (_) {
      summaryLoaded = false;
    }
  }

  if (!summaryLoaded) {
    accountPaymentSummary = { cash: 0, jazzcash: 0, easypaisa: 0, bank_account: 0 };
  }

  try {
    const banks = await window.shopAPI.getBankAccounts();
    accountBankList = Array.isArray(banks) ? banks : [];
  } catch (_) {
    accountBankList = accountBankList || [];
  }

  renderAccountMethodSelects();
  renderAccountBankOptions();
  syncAccountBankUI();
}

function resetAccountForm() {
  accountEditingId = null;
  const dateEl = document.getElementById('acc-date');
  const typeEl = document.getElementById('acc-type');
  const methodEl = document.getElementById('acc-method');
  const amountEl = document.getElementById('acc-amount');
  const titleEl = document.getElementById('acc-title');
  const descEl = document.getElementById('acc-description');
  const notesEl = document.getElementById('acc-notes');
  const bankNewEl = document.getElementById('acc-bank-new');
  const saveBtn = document.getElementById('acc-save-btn');
  const cancelBtn = document.getElementById('acc-cancel-btn');
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
  if (typeEl) typeEl.value = 'income';
  renderAccountMethodSelects('cash');
  if (methodEl) methodEl.value = 'cash';
  renderAccountBankOptions('');
  if (amountEl) amountEl.value = '';
  if (titleEl) titleEl.value = '';
  if (descEl) descEl.value = '';
  if (notesEl) notesEl.value = '';
  if (bankNewEl) bankNewEl.value = '';
  const bankEl = document.getElementById('acc-bank');
  if (bankEl) bankEl.value = '';
  if (saveBtn) saveBtn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Save Transaction`;
  if (cancelBtn) cancelBtn.style.display = 'none';
  syncAccountBankUI();
}

async function loadAccountsPage() {
  await refreshAccountsMeta();
  if (!document.getElementById('acc-date')?.value) {
    document.getElementById('acc-date').value = new Date().toISOString().slice(0, 10);
  }
  resetAccountForm();
  await loadAccounts();
}

function debounceAccountsSearch() {
  clearTimeout(accountsSearchTimer);
  accountsSearchTimer = setTimeout(() => loadAccounts(), 300);
}

function clearAccountsFilters() {
  const ids = ['acc-search', 'acc-from', 'acc-to', 'acc-type-filter', 'acc-method-filter'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') el.value = '';
    else el.value = '';
  });
  loadAccounts();
}

async function saveAccountTransaction() {
  const method = document.getElementById('acc-method')?.value || 'cash';
  const bankName = method === 'bank_account' ? (document.getElementById('acc-bank')?.value || '').trim() : '';
  const payload = {
    txn_date: document.getElementById('acc-date')?.value || '',
    entry_type: document.getElementById('acc-type')?.value || 'income',
    payment_method: method,
    bank_name: bankName,
    amount: parseFloat(document.getElementById('acc-amount')?.value) || 0,
    title: document.getElementById('acc-title')?.value?.trim() || '',
    description: document.getElementById('acc-description')?.value || '',
    notes: document.getElementById('acc-notes')?.value || ''
  };

  if (!payload.txn_date) { showToast('Please enter date.', 'error'); return; }
  if (!payload.title) { showToast('Please enter title.', 'error'); return; }
  if (payload.amount <= 0) { showToast('Please enter valid amount.', 'error'); return; }
  if (payload.payment_method === 'bank_account' && !payload.bank_name) { showToast('Please select bank account.', 'error'); return; }

  try {
    if (accountEditingId) {
      await window.shopAPI.updateAccountTransaction({ ...payload, id: accountEditingId });
      showToast('Transaction updated successfully!', 'success');
    } else {
      await window.shopAPI.saveAccountTransaction(payload);
      showToast('Transaction saved successfully!', 'success');
    }
    resetAccountForm();
    await loadAccounts();
  } catch (e) {
    showToast('Transaction failed: ' + e.message, 'error');
  }
}

function cancelAccountEdit() {
  resetAccountForm();
  showToast('Account edit cancelled.', 'info');
}

function editAccountTransaction(id) {
  const row = accountRowsCache.find(r => r.source === 'manual' && Number(r.id) === Number(id));
  if (!row) { showToast('Only manual transactions can be edited here.', 'warning'); return; }
  accountEditingId = Number(id);

  document.getElementById('acc-date').value = row.txn_date || new Date().toISOString().slice(0, 10);
  document.getElementById('acc-type').value = row.entry_type || 'income';
  renderAccountMethodSelects(row.payment_method || 'cash');
  document.getElementById('acc-method').value = row.payment_method || 'cash';
  renderAccountBankOptions(row.bank_name || '');
  syncAccountBankUI();
  document.getElementById('acc-amount').value = String(row.amount || '');
  document.getElementById('acc-title').value = row.title || '';
  document.getElementById('acc-description').value = row.description || '';
  document.getElementById('acc-notes').value = row.notes || '';

  const saveBtn = document.getElementById('acc-save-btn');
  const cancelBtn = document.getElementById('acc-cancel-btn');
  if (saveBtn) saveBtn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>Update Transaction`;
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';

  const content = document.getElementById('content');
  if (content) content.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteAccountTransaction(id) {
  if (!window.confirm('Delete this manual account transaction?')) return;
  try {
    await window.shopAPI.deleteAccountTransaction(id);
    if (accountEditingId === Number(id)) resetAccountForm();
    showToast('Transaction deleted.', 'success');
    await loadAccounts();
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'error');
  }
}

async function loadAccounts() {
  const params = {
    search: document.getElementById('acc-search')?.value || '',
    dateFrom: document.getElementById('acc-from')?.value || '',
    dateTo: document.getElementById('acc-to')?.value || '',
    entryType: document.getElementById('acc-type-filter')?.value || '',
    paymentMethod: document.getElementById('acc-method-filter')?.value || ''
  };
  const tbody = document.getElementById('acc-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" class="loading-state"><div class="loading-spinner"></div>Loading...</td></tr>';

  try {
    const [data] = await Promise.all([
      window.shopAPI.getAccountTransactions(params),
      refreshAccountsMeta()
    ]);
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    accountRowsCache = rows;

    const hasAnyMethodAmount = Object.values(accountPaymentSummary || {}).some(v => Math.abs(parseFloat(v) || 0) > 0.00001);
    if (!hasAnyMethodAmount && rows.length > 0) {
      accountPaymentSummary = buildMethodSummaryFromRows(rows);
      renderAccountMethodSelects(document.getElementById('acc-method')?.value || 'cash');
    }

    document.getElementById('acc-total-income').textContent = formatCurrency(data?.summary?.total_income || 0);
    document.getElementById('acc-total-expense').textContent = formatCurrency(data?.summary?.total_expense || 0);
    document.getElementById('acc-net-balance').textContent = formatCurrency(data?.summary?.net_balance || 0);

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="no-data">No transactions found</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const sourceBadge = r.source === 'manual'
        ? '<span class="badge badge-blue">Manual</span>'
        : (r.source === 'sale' ? '<span class="badge badge-green">Sale</span>' : '<span class="badge badge-purple">Owner</span>');
      const typeBadge = r.entry_type === 'income'
        ? '<span class="badge badge-green">Income</span>'
        : '<span class="badge badge-red">Expense</span>';
      const actionHtml = r.source === 'manual'
        ? `<button class="btn btn-outline-primary btn-sm btn-icon" onclick="editAccountTransaction(${r.id})" title="Edit">
             <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
           </button>
           <button class="btn btn-danger btn-sm btn-icon" onclick="deleteAccountTransaction(${r.id})" title="Delete">
             <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
           </button>`
        : '<span class="text-muted text-sm">Auto</span>';

      return `<tr>
        <td class="font-semibold">${formatDate(r.txn_date)}</td>
        <td>${sourceBadge}</td>
        <td>${typeBadge}</td>
        <td>${escHtml(formatPaymentMethodLabel(r.payment_method, r.bank_name))}</td>
        <td class="font-semibold">${escHtml(r.title || '—')}</td>
        <td class="text-muted">${escHtml(r.description || '—')}</td>
        <td class="${r.entry_type === 'income' ? 'text-success' : 'text-danger'} font-semibold">${formatCurrency(r.amount)}</td>
        <td class="text-muted">${escHtml(r.notes || '—')}</td>
        <td>${actionHtml}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="9" class="no-data">Error: ' + e.message + '</td></tr>';
  }
}

// ==================== SETTINGS ====================
async function loadSettings() {
  settings = await window.shopAPI.getSettings();
  document.getElementById('set-name').value = settings.shop_name || '';
  document.getElementById('set-phone').value = settings.shop_phone || '';
  document.getElementById('set-address').value = settings.shop_address || '';
  document.getElementById('set-tagline').value = settings.shop_tagline || '';
  document.getElementById('set-prefix').value = settings.bill_prefix || 'ABD';
}

async function saveSettings() {
  const ns = {
    shop_name: document.getElementById('set-name').value,
    shop_phone: document.getElementById('set-phone').value,
    shop_address: document.getElementById('set-address').value,
    shop_tagline: document.getElementById('set-tagline').value,
    bill_prefix: document.getElementById('set-prefix').value || 'ABD',
  };
  try {
    await window.shopAPI.saveSettings(ns);
    settings = { ...settings, ...ns };
    updateShopHeader();
    showToast('Settings saved successfully!', 'success');
  } catch (e) { showToast('Failed to save settings: ' + e.message, 'error'); }
}

// ==================== UTILITIES ====================
function isCustomCategory(cat) {
  return !!cat && !FIXED_SALE_CATEGORIES.some(c => c.value === cat);
}

function isSizeBasedCategory(cat) {
  return cat === 'flex' || cat === '3d_signboard' || cat === 'qatba_plate' || cat === 'stiker';
}

function getDefaultMeasureTypeForCategory(cat) {
  return 'qty';
}

function getItemMeasureType(item) {
  if (!item) return 'qty';
  if (item.measure_type === 'size' || item.measure_type === 'qty' || item.measure_type === 'custom') return item.measure_type;
  const hasSize = (parseFloat(item.width_inch) || 0) > 0 && (parseFloat(item.height_inch) || 0) > 0;
  if (hasSize || (parseFloat(item.sq_ft) || 0) > 0) return 'size';
  return 'qty';
}

function isSizeBasedItem(item) {
  return getItemMeasureType(item) === 'size';
}

function getItemTypeLabel(item) {
  const measureType = getItemMeasureType(item);
  if (measureType === 'size') return 'Size Based';
  if (measureType === 'custom') return (item?.custom_type_name || '').trim() || 'Custom Type';
  return 'Qty Based';
}

function inchesToSqFt(w, h) { return (parseFloat(w) || 0) * (parseFloat(h) || 0); }

function formatCurrency(amount) {
  const n = Math.round(amount || 0);
  return 'Rs. ' + n.toLocaleString('en-PK');
}

function formatPaymentMethodLabel(method, bankName = '') {
  const v = String(method || '').toLowerCase();
  if (v === 'jazzcash') return 'JazzCash';
  if (v === 'easypaisa') return 'EasyPaisa';
  if (v === 'bank_account') {
    const bank = String(bankName || '').trim();
    return bank ? `Bank Account - ${bank}` : 'Bank Account';
  }
  return 'Cash';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try { return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch (e) { return dateStr; }
}

function formatLedgerTime(timeStr) {
  const raw = String(timeStr || '').trim();
  if (!raw) return '—';
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return raw;
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10) || 0));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10) || 0));
  const dt = new Date();
  dt.setHours(hh, mm, 0, 0);
  return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function getCategoryName(cat) {
  return { flex: 'FLEX', '3d_signboard': '3D SIGN BOARD', number_plate: 'NUMBER PLATE', qatba_plate: 'QATBA PLATE' , stiker: 'STIKER', manual: 'MANUAL' }[cat] || cat;
}
function getSaleCategoryOptionsHTML(currentCategory, customCategoryMode = false) {
  const fixedValues = new Set(FIXED_SALE_CATEGORIES.map(c => c.value));
  const fixedOptions = FIXED_SALE_CATEGORIES.map(c =>
    `<option value="${c.value}" ${currentCategory === c.value ? 'selected' : ''}>${c.label}</option>`
  ).join('');
  const customOption = (currentCategory && !fixedValues.has(currentCategory))
    ? `<option value="${escHtml(currentCategory)}" selected>${escHtml(getCategoryName(currentCategory))}</option>`
    : '';
  const customSelectorSelected = customCategoryMode && (!currentCategory || fixedValues.has(currentCategory));
  return fixedOptions + customOption + `<option value="${ADD_CUSTOM_CATEGORY_VALUE}" ${customSelectorSelected ? 'selected' : ''}>+ Custom Category</option>`;
}
function getCategoryBadgeClass(cat) {
  return { flex: 'badge-yellow', '3d_signboard': 'badge-purple', number_plate: 'badge-blue', qatba_plate : 'badge-green' , stiker: 'badge-pink', manual: 'badge-gray' }[cat] || 'badge-gray';
}
function getCategoryColor(cat) {
  return { flex: '#D97706', '3d_signboard': '#7C3AED', number_plate: '#2563EB', qatba_plate: '#059669' , stiker: '#EC4899', manual: '#64748B' }[cat] || '#2563EB';
}
function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;

  const svgIcons = {
    success: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    warning: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };
  const titles = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' };

  toast.innerHTML = `
    <div class="toast-icon-wrap">${svgIcons[type] || svgIcons.info}</div>
    <div class="toast-body">
      <div class="toast-title">${titles[type] || 'Notice'}</div>
      <div class="toast-msg">${message}</div>
    </div>
    <button class="toast-close" onclick="this.closest('.toast').remove()" title="Dismiss">
      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity .3s cubic-bezier(.4,0,.2,1), transform .3s cubic-bezier(.4,0,.2,1)';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 320);
  }, 4200);
}

// ===== DAILY EXPENSES PDF — shared helper =====
function _getDailyExpensesPDFHtml(dateStr, kamayaRows, useHogaRows) {
  const totalKamaya = (kamayaRows || []).reduce((s, r) => s + (parseFloat(r.sale_price) || 0), 0);
  const totalUseHoga = (useHogaRows || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const net = totalKamaya - totalUseHoga;
  const d = new Date(dateStr + 'T12:00:00');
  const dateLabel = d.toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const netColor = net >= 0 ? '#059669' : '#DC2626';
  const netLabel = net >= 0 ? 'Profit' : 'Loss';

  const kamayaRows_html = !kamayaRows?.length
    ? '<tr><td colspan="3" style="text-align:center;padding:10px;color:#999;">No entries</td></tr>'
    : kamayaRows.map((r, i) => `<tr style="border-bottom:1px solid #e7f5ee;">
        <td style="padding:7px 10px;border:1px solid #d1fae5;">${i+1}</td>
        <td style="padding:7px 10px;border:1px solid #d1fae5;">${r.product_name || '—'}</td>
        <td style="padding:7px 10px;border:1px solid #d1fae5;text-align:right;font-weight:600;">Rs. ${Math.round(parseFloat(r.sale_price)||0).toLocaleString('en-PK')}</td>
      </tr>`).join('');

  const useHogaRows_html = !useHogaRows?.length
    ? '<tr><td colspan="3" style="text-align:center;padding:10px;color:#999;">No entries</td></tr>'
    : useHogaRows.map((r, i) => `<tr style="border-bottom:1px solid #fee2e2;">
        <td style="padding:7px 10px;border:1px solid #fecaca;">${i+1}</td>
        <td style="padding:7px 10px;border:1px solid #fecaca;">${r.item_name || '—'}</td>
        <td style="padding:7px 10px;border:1px solid #fecaca;text-align:right;font-weight:600;">Rs. ${Math.round(parseFloat(r.amount)||0).toLocaleString('en-PK')}</td>
      </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      body { font-family: Arial, sans-serif; padding: 36px; color: #1a1a1a; font-size: 13px; }
      h1 { text-align:center; font-size:20px; margin-bottom:4px; color:#1e3a5f; }
      .date { text-align:center; color:#666; font-size:13px; margin-bottom:28px; }
      .grid { display:flex; gap:28px; margin-bottom:24px; }
      .col { flex:1; }
      .col-head { padding:10px 14px; border-radius:6px 6px 0 0; font-weight:700; font-size:13px; color:#fff; margin:0; }
      table { width:100%; border-collapse:collapse; font-size:12px; }
      th { padding:7px 10px; text-align:left; font-weight:600; }
      .net-box { border:2px solid ${netColor}; border-radius:8px; padding:18px; text-align:center; background:${net>=0?'#f0fdf4':'#fef2f2'}; }
      .net-label { font-size:12px; color:#666; margin-bottom:6px; }
      .net-val { font-size:26px; font-weight:800; color:${netColor}; }
      .net-formula { font-size:11px; color:#999; margin-top:6px; }
      .total-row td { font-weight:700; padding:8px 10px; }
    </style></head><body>
    <h1>Abdullah Shop — Daily Summary</h1>
    <div class="date">${dateLabel}</div>
    <div class="grid">
      <div class="col">
        <div class="col-head" style="background:#059669;">Today's Earnings</div>
        <table>
          <thead><tr style="background:#f0fdf4;">
            <th style="border:1px solid #d1fae5;width:30px;">#</th>
            <th style="border:1px solid #d1fae5;">Product / Item</th>
            <th style="border:1px solid #d1fae5;text-align:right;">Amount</th>
          </tr></thead>
          <tbody>${kamayaRows_html}</tbody>
          <tfoot><tr class="total-row" style="background:#f0fdf4;border-top:2px solid #059669;">
            <td colspan="2" style="text-align:right;border:1px solid #d1fae5;color:#059669;">Total Earned:</td>
            <td style="text-align:right;border:1px solid #d1fae5;color:#059669;font-size:14px;">Rs. ${Math.round(totalKamaya).toLocaleString('en-PK')}</td>
          </tr></tfoot>
        </table>
      </div>
      <div class="col">
        <div class="col-head" style="background:#DC2626;">Today's Expenses</div>
        <table>
          <thead><tr style="background:#fef2f2;">
            <th style="border:1px solid #fecaca;width:30px;">#</th>
            <th style="border:1px solid #fecaca;">Item / Name</th>
            <th style="border:1px solid #fecaca;text-align:right;">Amount</th>
          </tr></thead>
          <tbody>${useHogaRows_html}</tbody>
          <tfoot><tr class="total-row" style="background:#fef2f2;border-top:2px solid #DC2626;">
            <td colspan="2" style="text-align:right;border:1px solid #fecaca;color:#DC2626;">Total Spent:</td>
            <td style="text-align:right;border:1px solid #fecaca;color:#DC2626;font-size:14px;">Rs. ${Math.round(totalUseHoga).toLocaleString('en-PK')}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>
    <div class="net-box">
      <div class="net-label">${netLabel}</div>
      <div class="net-val">Rs. ${Math.round(Math.abs(net)).toLocaleString('en-PK')}</div>
      <div class="net-formula">Earned Rs. ${Math.round(totalKamaya).toLocaleString('en-PK')} − Spent Rs. ${Math.round(totalUseHoga).toLocaleString('en-PK')}</div>
    </div>
  </body></html>`;
}

async function _saveDailyExpensesPDF(dateStr) {
  const [kamayaRows, useHogaRows] = await Promise.all([
    window.shopAPI.getProductBills({ dateFrom: dateStr, dateTo: dateStr }),
    window.shopAPI.getDailyKhataEntries({ dateFrom: dateStr, dateTo: dateStr })
  ]);
  const html = _getDailyExpensesPDFHtml(dateStr, kamayaRows, useHogaRows);
  const result = await window.shopAPI.savePDF({
    htmlContent: html,
    filename: `DailyExpenses_${dateStr}.pdf`,
    subfolder: 'Abdullah Shop - Daily Expenses'
  });
  _markDayCompleted(dateStr);
  return result;
}

// ===== COMPLETED DAYS TRACKING (localStorage) =====
function _getCompletedDays() {
  try { return new Set(JSON.parse(localStorage.getItem('_completedDays') || '[]')); }
  catch { return new Set(); }
}
function _markDayCompleted(dateStr) {
  const days = _getCompletedDays();
  days.add(dateStr);
  const sorted = [...days].sort().slice(-60); // keep last 60 days
  localStorage.setItem('_completedDays', JSON.stringify(sorted));
}

// ===== AUTO-SAVE MISSED DAYS ON STARTUP =====
async function autoSaveMissedDays() {
  try {
    const completed = _getCompletedDays();
    const today = new Date().toISOString().slice(0, 10);
    const missed = [];

    // Check last 7 days (excluding today)
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      if (!completed.has(dateStr)) missed.push(dateStr);
    }
    if (!missed.length) return;

    for (const dateStr of missed) {
      const [sales, expenses] = await Promise.all([
        window.shopAPI.getProductBills({ dateFrom: dateStr, dateTo: dateStr }),
        window.shopAPI.getDailyKhataEntries({ dateFrom: dateStr, dateTo: dateStr })
      ]);
      const hasData = (sales?.length || 0) + (expenses?.length || 0) > 0;
      if (hasData) {
        const html = _getDailyExpensesPDFHtml(dateStr, sales, expenses);
        await window.shopAPI.savePDF({
          htmlContent: html,
          filename: `DailyExpenses_${dateStr}.pdf`,
          subfolder: 'Abdullah Shop - Daily Expenses'
        });
        showToast(`Auto-saved Daily Summary PDF for ${dateStr}`, 'info');
      }
      _markDayCompleted(dateStr); // mark even if no data, so we don't check again
    }
  } catch (e) {
    console.error('Auto-save missed days error:', e);
  }
}

async function completeDayEntry() {
  const dateEl = document.getElementById('khata-date');
  const selectedDate = dateEl?.value;
  if (!selectedDate) {
    showToast('Please select a date in the Expenses form first!', 'warning');
    return;
  }
  try {
    const result = await _saveDailyExpensesPDF(selectedDate);
    showToast(`✓ Day complete! PDF saved → ${result?.path || 'Documents/Abdullah Shop - Daily Expenses'}`, 'success');
  } catch (e) {
    showToast('Complete day failed: ' + e.message, 'error');
  }
}

async function exportDailyKhataMonthlyPDF() {
  const dateFromEl = document.getElementById('pl-from');
  const dateToEl = document.getElementById('pl-to');
  const dateFrom = dateFromEl?.value;
  const dateTo = dateToEl?.value;
  if (!dateFrom || !dateTo) {
    showToast('Please select both From and To dates!', 'warning');
    return;
  }
  try {
    const entries = await window.shopAPI.getDailyKhataEntries({ dateFrom, dateTo });
    const summary = await window.shopAPI.getDailyKhataSummary({ dateFrom, dateTo });
    if (!Array.isArray(entries) || entries.length === 0) {
      showToast('No entries in selected date range', 'info');
      return;
    }
    const groupedByDate = {};
    entries.forEach(e => {
      const d = e.date || '';
      if (!groupedByDate[d]) groupedByDate[d] = [];
      groupedByDate[d].push(e);
    });
    const dates = Object.keys(groupedByDate).sort();
    let html = `<div style="font-family: Arial, sans-serif; padding: 40px; color: #333;">
      <h2 style="text-align: center; margin-bottom: 5px; color: #1a1a1a;">Abdullah Shop - Daily Expenses Report</h2>
      <p style="text-align: center; margin-bottom: 30px; color: #666; font-size: 14px;">${dateFrom} to ${dateTo}</p>`;
    if (summary) {
      html += `<div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
        <p><strong>Total Entries:</strong> ${summary.total_entries || 0}</p>
        <p><strong>Total Amount:</strong> Rs. ${(summary.total_amount || 0).toLocaleString('en-PK')}</p>
        <p><strong>Average per Entry:</strong> Rs. ${summary.total_entries > 0 ? ((summary.total_amount || 0) / summary.total_entries).toLocaleString('en-PK', { maximumFractionDigits: 0 }) : '0'}</p>
      </div>`;
    }
    dates.forEach(d => {
      const dateEntries = groupedByDate[d];
      const dayTotal = dateEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      html += `<h3 style="margin-top: 25px; margin-bottom: 10px; color: #2563EB; border-bottom: 2px solid #2563EB; padding-bottom: 5px;">${d}</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px;">
          <thead><tr style="background: #e0e0e0; font-weight: bold;">
            <th style="padding: 8px; text-align: left; border: 1px solid #ccc;">Time</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #ccc;">Item/Name</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #ccc;">Quantity</th>
            <th style="padding: 8px; text-align: right; border: 1px solid #ccc;">Amount (Rs.)</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #ccc;">Notes</th>
          </tr></thead>
          <tbody>`;
      dateEntries.forEach(e => {
        html += `<tr style="border: 1px solid #ddd;">
          <td style="padding: 8px; border: 1px solid #ddd;">${e.time || '—'}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${e.item_name || '—'}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${e.quantity_details || '—'}</td>
          <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold;">${(parseFloat(e.amount) || 0).toLocaleString('en-PK')}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${e.notes || '—'}</td>
        </tr>`;
      });
      html += `<tr style="background: #f9f9f9; font-weight: bold; border: 1px solid #ddd;">
        <td colspan="3" style="padding: 8px; border: 1px solid #ddd; text-align: right;">Daily Total:</td>
        <td style="padding: 8px; text-align: right; border: 1px solid #ddd; color: #1a1a1a;">Rs. ${dayTotal.toLocaleString('en-PK')}</td>
        <td style="border: 1px solid #ddd;"></td>
      </tr></tbody>
        </table>`;
    });
    html += `</div>`;
    await window.shopAPI.savePDF({ fileName: `Expenses_${dateFrom}_to_${dateTo}.pdf`, htmlContent: html });
    showToast(`✓ PDF saved: Expenses_${dateFrom}_to_${dateTo}.pdf`, 'success');
  } catch (e) {
    showToast('PDF export failed: ' + e.message, 'error');
  }
}

// ==================== BOOT ====================
document.addEventListener('DOMContentLoaded', init);
