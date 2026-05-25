const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db;
let mainWindow;

// ==================== DATABASE INIT ====================
function getDbPath() {
  const userDataPath = app.getPath('userData');
  if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
  return path.join(userDataPath, 'abdullah_shop.db');
}

function ensureColumn(tableName, columnName, columnSql) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!cols.some(c => c.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
  }
}

function ensureFinancialTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS owner_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_name TEXT NOT NULL,
      txn_date TEXT NOT NULL,
      txn_kind TEXT NOT NULL CHECK (txn_kind IN ('withdraw', 'return')),
      amount REAL NOT NULL DEFAULT 0,
      linked_withdrawal_id INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (linked_withdrawal_id) REFERENCES owner_ledger(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS account_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txn_date TEXT NOT NULL,
      entry_type TEXT NOT NULL CHECK (entry_type IN ('income', 'expense')),
      payment_method TEXT NOT NULL DEFAULT 'cash',
      bank_name TEXT DEFAULT '',
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_owner_ledger_owner_date ON owner_ledger(owner_name, txn_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_owner_ledger_linked ON owner_ledger(linked_withdrawal_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_accounts_txn_date ON account_transactions(txn_date)`);
}

function ensureSalePaymentTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sale_payments_date ON sale_payments(payment_date)`);
}

// ==================== FLEX TABLES ====================
function ensureFlexTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS flex_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_no TEXT UNIQUE,
      client_name TEXT NOT NULL DEFAULT '',
      client_phone TEXT DEFAULT '',
      bill_date TEXT NOT NULL,
      description TEXT DEFAULT '',
      width_ft REAL DEFAULT 0,
      height_ft REAL DEFAULT 0,
      sq_ft REAL DEFAULT 0,
      rate_per_sqft REAL DEFAULT 0,
      quantity INTEGER DEFAULT 1,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','partial','paid')),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS flex_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS flex_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flex_bill_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (flex_bill_id) REFERENCES flex_bills(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_flex_bills_date ON flex_bills(bill_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_flex_expenses_date ON flex_expenses(expense_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_flex_payments_bill ON flex_payments(flex_bill_id)`);
}

function generateFlexBillNo() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const cnt = db.prepare("SELECT COUNT(*) as c FROM flex_bills WHERE bill_date = date('now','localtime')").get().c;
  return `FLX-${today}-${String(cnt + 1).padStart(3, '0')}`;
}

function recalcFlexBill(billId) {
  const paid = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM flex_payments WHERE flex_bill_id=?`).get(billId).total;
  const bill = db.prepare(`SELECT total_amount FROM flex_bills WHERE id=?`).get(billId);
  if (!bill) return;
  const balance = Math.max(0, bill.total_amount - paid);
  const status = paid <= 0 ? 'pending' : (balance <= 0.001 ? 'paid' : 'partial');
  db.prepare(`UPDATE flex_bills SET paid_amount=?, balance=?, status=? WHERE id=?`).run(paid, balance, status, billId);
}

function ensureDailyKhataTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_khata_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL,
      entry_time TEXT DEFAULT '',
      item_name TEXT NOT NULL,
      quantity_details TEXT DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  ensureColumn('daily_khata_entries', 'entry_time', `entry_time TEXT DEFAULT ''`);
  ensureColumn('daily_khata_entries', 'quantity_details', `quantity_details TEXT DEFAULT ''`);
  ensureColumn('daily_khata_entries', 'notes', `notes TEXT DEFAULT ''`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_daily_khata_date ON daily_khata_entries(entry_date)`);
}

function initDatabase() {
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit_price REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_no TEXT UNIQUE,
      customer_name TEXT DEFAULT '',
      customer_phone TEXT DEFAULT '',
      total_amount REAL NOT NULL DEFAULT 0,
      discount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      balance REAL DEFAULT 0,
      sale_date TEXT DEFAULT (date('now','localtime')),
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      width_inch REAL DEFAULT 0,
      height_inch REAL DEFAULT 0,
      sq_ft REAL DEFAULT 0,
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_date TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      cost_price REAL DEFAULT 0,
      sale_price REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS owner_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_name TEXT NOT NULL,
      txn_date TEXT NOT NULL,
      txn_kind TEXT NOT NULL CHECK (txn_kind IN ('withdraw', 'return')),
      amount REAL NOT NULL DEFAULT 0,
      linked_withdrawal_id INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (linked_withdrawal_id) REFERENCES owner_ledger(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS account_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txn_date TEXT NOT NULL,
      entry_type TEXT NOT NULL CHECK (entry_type IN ('income', 'expense')),
      payment_method TEXT NOT NULL DEFAULT 'cash',
      bank_name TEXT DEFAULT '',
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  ensureColumn('sales', 'payment_method', `payment_method TEXT DEFAULT 'cash'`);
  ensureColumn('account_transactions', 'bank_name', `bank_name TEXT DEFAULT ''`);
  ensureColumn('product_bills', 'category', `category TEXT DEFAULT ''`);
  ensureSalePaymentTable();
  ensureFinancialTables();
  ensureDailyKhataTable();
  ensureFlexTables();

  const ins = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
  ins.run('shop_name', 'Abdullah Shop');
  ins.run('shop_address', 'Enter Your Address Here');
  ins.run('shop_phone', '03XX-XXXXXXX');
  ins.run('shop_tagline', 'Sign Board | Flex | 3D Board | Number Plates | Memorial Plates');
  ins.run('bill_prefix', 'ABD');
  ins.run('bank_accounts', '[]');
}

function generateBillNo() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = (() => { try { return db.prepare("SELECT value FROM settings WHERE key='bill_prefix'").get().value; } catch(e) { return 'ABD'; } })();
  const cnt = db.prepare("SELECT COUNT(*) as c FROM sales WHERE sale_date = date('now','localtime')").get().c;
  return `${prefix}-${today}-${String(cnt + 1).padStart(3, '0')}`;
}

function normalizePaymentMethod(method) {
  const v = String(method || '').trim().toLowerCase();
  if (v === 'jazzcash' || v === 'easypaisa' || v === 'bank_account') return v;
  return 'cash';
}

function ensureLegacySalePaymentRows(saleId) {
  ensureSalePaymentTable();
  const sale = db.prepare(`SELECT id, sale_date, paid_amount, payment_method FROM sales WHERE id=?`).get(saleId);
  if (!sale) throw new Error('Sale not found.');
  const existing = db.prepare(`SELECT COUNT(*) as c FROM sale_payments WHERE sale_id=?`).get(saleId).c;
  const paid = parseFloat(sale.paid_amount) || 0;
  if (existing === 0 && paid > 0) {
    db.prepare(`
      INSERT INTO sale_payments (sale_id, payment_date, amount, payment_method, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(sale.id, sale.sale_date || new Date().toISOString().slice(0, 10), paid, normalizePaymentMethod(sale.payment_method), 'Initial payment');
  }
  return sale;
}

function recalcSalePaymentTotals(saleId) {
  ensureSalePaymentTable();
  const sale = db.prepare(`SELECT total_amount FROM sales WHERE id=?`).get(saleId);
  if (!sale) throw new Error('Sale not found.');
  const paid = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM sale_payments WHERE sale_id=?`).get(saleId).total || 0;
  const balance = Math.max(0, (parseFloat(sale.total_amount) || 0) - paid);
  const lastPayment = db.prepare(`
    SELECT payment_method FROM sale_payments
    WHERE sale_id=?
    ORDER BY payment_date DESC, id DESC
    LIMIT 1
  `).get(saleId);
  db.prepare(`UPDATE sales SET paid_amount=?, balance=?, payment_method=? WHERE id=?`)
    .run(paid, balance, normalizePaymentMethod(lastPayment?.payment_method), saleId);
  return { paid_amount: paid, balance };
}

function persistSalePayment(payload = {}) {
  ensureSalePaymentTable();
  const saleId = Number(payload.sale_id);
  if (!saleId) throw new Error('Invalid sale id.');
  const paymentDate = String(payload.payment_date || '').trim() || new Date().toISOString().slice(0, 10);
  const amount = parseFloat(payload.amount) || 0;
  const paymentMethod = normalizePaymentMethod(payload.payment_method);
  const notes = String(payload.notes || '').trim();

  if (amount <= 0) throw new Error('Payment amount must be greater than zero.');

  return db.transaction(() => {
    ensureLegacySalePaymentRows(saleId);
    const sale = db.prepare(`SELECT id, total_amount, paid_amount, balance FROM sales WHERE id=?`).get(saleId);
    if (!sale) throw new Error('Sale not found.');
    const balance = Math.max(0, parseFloat(sale.balance) || 0);
    if (balance <= 0.00001) throw new Error('This bill is already fully paid.');
    if (amount > balance + 0.00001) throw new Error('Payment amount exceeds remaining balance.');

    const res = db.prepare(`
      INSERT INTO sale_payments (sale_id,payment_date,amount,payment_method,notes)
      VALUES (?,?,?,?,?)
    `).run(saleId, paymentDate, amount, paymentMethod, notes);
    const totals = recalcSalePaymentTotals(saleId);
    return { success: true, id: res.lastInsertRowid, ...totals };
  })();
}

function querySalePayments(saleId) {
  const id = Number(saleId);
  if (!id) return [];
  ensureLegacySalePaymentRows(id);
  return db.prepare(`
    SELECT * FROM sale_payments
    WHERE sale_id=?
    ORDER BY payment_date DESC, id DESC
  `).all(id);
}

function normalizeKhataTime(timeValue) {
  const val = String(timeValue || '').trim();
  const m = val.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return new Date().toTimeString().slice(0, 5);
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10) || 0));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10) || 0));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function queryDailyKhataEntries({ dateFrom = '', dateTo = '', date = '', search = '' } = {}) {
  ensureDailyKhataTable();
  let where = 'WHERE 1=1';
  const params = [];
  if (date) {
    where += ` AND entry_date = ?`;
    params.push(date);
  } else {
    if (dateFrom) { where += ` AND entry_date >= ?`; params.push(dateFrom); }
    if (dateTo)   { where += ` AND entry_date <= ?`; params.push(dateTo); }
  }
  if (search) {
    where += ` AND (item_name LIKE ? OR quantity_details LIKE ? OR notes LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  return db.prepare(`
    SELECT * FROM daily_khata_entries
    ${where}
    ORDER BY entry_date DESC, entry_time DESC, id DESC
  `).all(...params);
}

function queryDailyKhataSummary({ dateFrom = '', dateTo = '', date = '' } = {}) {
  ensureDailyKhataTable();
  let where = 'WHERE 1=1';
  const params = [];
  if (date) {
    where += ` AND entry_date = ?`;
    params.push(date);
  } else {
    if (dateFrom) { where += ` AND entry_date >= ?`; params.push(dateFrom); }
    if (dateTo)   { where += ` AND entry_date <= ?`; params.push(dateTo); }
  }

  return db.prepare(`
    SELECT
      COUNT(*) as total_entries,
      COALESCE(SUM(amount), 0) as total_amount,
      COALESCE(AVG(amount), 0) as avg_amount,
      MAX(entry_date) as last_entry_date
    FROM daily_khata_entries
    ${where}
  `).get(...params);
}

function getBankAccounts() {
  try {
    const raw = db.prepare(`SELECT value FROM settings WHERE key='bank_accounts'`).get()?.value;
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    const dedup = new Map();
    parsed.forEach(name => {
      const n = String(name || '').trim();
      if (!n) return;
      const key = n.toLowerCase();
      if (!dedup.has(key)) dedup.set(key, n);
    });
    return [...dedup.values()];
  } catch (_) {
    return [];
  }
}

function saveBankAccounts(list = []) {
  const dedup = new Map();
  list.forEach(name => {
    const n = String(name || '').trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, n);
  });
  const clean = [...dedup.values()];
  db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('bank_accounts', ?)`).run(JSON.stringify(clean));
  return clean;
}

function queryAccountPaymentSummary() {
  ensureFinancialTables();
  ensureSalePaymentTable();
  const rows = db.prepare(`
    SELECT
      payment_method,
      COALESCE(SUM(CASE WHEN entry_type='income' THEN amount ELSE -amount END), 0) as net_amount
    FROM (
      SELECT
        COALESCE(NULLIF(at.payment_method, ''), 'cash') as payment_method,
        at.entry_type,
        at.amount
      FROM account_transactions at

      UNION ALL

      SELECT
        COALESCE(NULLIF(sp.payment_method, ''), 'cash') as payment_method,
        'income' as entry_type,
        sp.amount as amount
      FROM sale_payments sp
      WHERE sp.amount > 0

      UNION ALL

      SELECT
        COALESCE(NULLIF(s.payment_method, ''), 'cash') as payment_method,
        'income' as entry_type,
        s.paid_amount as amount
      FROM sales s
      WHERE s.paid_amount > 0
        AND NOT EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id)

      UNION ALL

      SELECT
        'cash' as payment_method,
        CASE WHEN o.txn_kind='withdraw' THEN 'expense' ELSE 'income' END as entry_type,
        o.amount as amount
      FROM owner_ledger o
    ) tx
    GROUP BY payment_method
  `).all();

  const summary = { cash: 0, jazzcash: 0, easypaisa: 0, bank_account: 0 };
  rows.forEach(r => {
    const method = normalizePaymentMethod(r.payment_method);
    summary[method] = parseFloat(r.net_amount) || 0;
  });
  return summary;
}

function getOwnerWithdrawalBalance(withdrawalId, excludeReturnId = null) {
  const withdrawal = db.prepare(`SELECT id, owner_name, txn_date, amount FROM owner_ledger WHERE id=? AND txn_kind='withdraw'`).get(withdrawalId);
  if (!withdrawal) throw new Error('Linked withdrawal not found.');

  let retSql = `SELECT COALESCE(SUM(amount),0) as s FROM owner_ledger WHERE txn_kind='return' AND linked_withdrawal_id=?`;
  const retParams = [withdrawalId];
  if (excludeReturnId) {
    retSql += ` AND id<>?`;
    retParams.push(excludeReturnId);
  }
  const returned = db.prepare(retSql).get(...retParams).s || 0;
  return { withdrawal, returned, balance: (withdrawal.amount || 0) - returned };
}

function queryOwnerWithdrawals(ownerName = '') {
  ensureFinancialTables();
  let where = `WHERE w.txn_kind='withdraw'`;
  const params = [];
  if (ownerName) { where += ` AND w.owner_name=?`; params.push(ownerName); }

  return db.prepare(`
    SELECT
      w.id,
      w.owner_name,
      w.txn_date,
      w.amount,
      w.notes,
      COALESCE(SUM(r.amount), 0) as returned_amount,
      (w.amount - COALESCE(SUM(r.amount), 0)) as balance_amount
    FROM owner_ledger w
    LEFT JOIN owner_ledger r
      ON r.txn_kind='return' AND r.linked_withdrawal_id=w.id
    ${where}
    GROUP BY w.id, w.owner_name, w.txn_date, w.amount, w.notes
    ORDER BY w.txn_date DESC, w.id DESC
  `).all(...params);
}

function queryOwnerLedger({ ownerName = '', dateFrom = '', dateTo = '' } = {}) {
  ensureFinancialTables();
  const groupDateExpr = `CASE WHEN o.txn_kind='return' AND o.linked_withdrawal_id IS NOT NULL THEN COALESCE(w.txn_date, o.txn_date) ELSE o.txn_date END`;
  let where = 'WHERE 1=1';
  const params = [];
  if (ownerName) { where += ' AND o.owner_name=?'; params.push(ownerName); }
  if (dateFrom) { where += ` AND ${groupDateExpr} >= ?`; params.push(dateFrom); }
  if (dateTo)   { where += ` AND ${groupDateExpr} <= ?`; params.push(dateTo); }

  const rows = db.prepare(`
    SELECT
      o.id,
      o.owner_name,
      o.txn_date,
      o.txn_kind,
      o.amount,
      o.linked_withdrawal_id,
      o.notes,
      o.created_at,
      ${groupDateExpr} as group_date,
      w.txn_date as linked_withdrawal_date,
      w.amount as linked_withdrawal_amount
    FROM owner_ledger o
    LEFT JOIN owner_ledger w ON w.id=o.linked_withdrawal_id
    ${where}
    ORDER BY group_date DESC, o.txn_date DESC, o.id DESC
  `).all(...params);

  const summary = rows.reduce((acc, r) => {
    if (r.txn_kind === 'withdraw') acc.total_withdraw += r.amount || 0;
    else acc.total_return += r.amount || 0;
    return acc;
  }, { total_withdraw: 0, total_return: 0 });
  summary.net_outstanding = summary.total_withdraw - summary.total_return;

  return { rows, summary };
}

function persistOwnerEntry(payload = {}) {
  ensureFinancialTables();
  const ownerName = String(payload.owner_name || '').trim();
  const txnDate = String(payload.txn_date || '').trim() || new Date().toISOString().slice(0, 10);
  const txnKind = payload.txn_kind === 'return' ? 'return' : 'withdraw';
  const amount = parseFloat(payload.amount) || 0;
  const notes = String(payload.notes || '');
  const linkedWithdrawalId = payload.linked_withdrawal_id ? Number(payload.linked_withdrawal_id) : null;

  if (!txnDate) throw new Error('Transaction date is required.');
  if (amount <= 0) throw new Error('Amount must be greater than zero.');

  if (txnKind === 'withdraw') {
    if (!ownerName) throw new Error('Owner name is required.');
    const res = db.prepare(`
      INSERT INTO owner_ledger (owner_name, txn_date, txn_kind, amount, notes)
      VALUES (?, ?, 'withdraw', ?, ?)
    `).run(ownerName, txnDate, amount, notes);
    return { success: true, id: res.lastInsertRowid };
  }

  if (!linkedWithdrawalId) throw new Error('Please select the related withdrawal entry.');
  const { withdrawal, balance } = getOwnerWithdrawalBalance(linkedWithdrawalId);
  if (amount > balance + 0.00001) throw new Error('Return amount exceeds remaining balance for selected withdrawal.');

  const res = db.prepare(`
    INSERT INTO owner_ledger (owner_name, txn_date, txn_kind, amount, linked_withdrawal_id, notes)
    VALUES (?, ?, 'return', ?, ?, ?)
  `).run(withdrawal.owner_name, txnDate, amount, linkedWithdrawalId, notes);
  return { success: true, id: res.lastInsertRowid };
}

function queryAccountTransactions({ search = '', dateFrom = '', dateTo = '', entryType = '', paymentMethod = '' } = {}) {
  ensureFinancialTables();
  ensureSalePaymentTable();
  let where = 'WHERE 1=1';
  const params = [];
  const normalizedMethod = paymentMethod ? normalizePaymentMethod(paymentMethod) : '';

  if (search) {
    where += ` AND (title LIKE ? OR description LIKE ? OR notes LIKE ? OR bank_name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (dateFrom) { where += ` AND txn_date >= ?`; params.push(dateFrom); }
  if (dateTo)   { where += ` AND txn_date <= ?`; params.push(dateTo); }
  if (entryType === 'income' || entryType === 'expense') { where += ` AND entry_type = ?`; params.push(entryType); }
  if (normalizedMethod) { where += ` AND payment_method = ?`; params.push(normalizedMethod); }

  const rows = db.prepare(`
    SELECT * FROM (
      SELECT
        at.id,
        'manual' as source,
        at.txn_date,
        at.entry_type,
        at.payment_method,
        COALESCE(at.bank_name, '') as bank_name,
        at.title,
        at.description,
        at.amount,
        at.notes,
        at.created_at,
        1 as can_edit
      FROM account_transactions at

      UNION ALL

      SELECT
        sp.id,
        'sale' as source,
        sp.payment_date as txn_date,
        'income' as entry_type,
        COALESCE(NULLIF(sp.payment_method, ''), 'cash') as payment_method,
        '' as bank_name,
        ('Sale ' || s.bill_no) as title,
        ('Customer: ' || COALESCE(NULLIF(s.customer_name, ''), 'Walk-in')) as description,
        sp.amount as amount,
        COALESCE(NULLIF(sp.notes, ''), s.notes, '') as notes,
        sp.created_at,
        0 as can_edit
      FROM sale_payments sp
      JOIN sales s ON s.id = sp.sale_id
      WHERE sp.amount > 0

      UNION ALL

      SELECT
        s.id,
        'sale' as source,
        s.sale_date as txn_date,
        'income' as entry_type,
        COALESCE(NULLIF(s.payment_method, ''), 'cash') as payment_method,
        '' as bank_name,
        ('Sale ' || s.bill_no) as title,
        ('Customer: ' || COALESCE(NULLIF(s.customer_name, ''), 'Walk-in')) as description,
        s.paid_amount as amount,
        COALESCE(s.notes, '') as notes,
        s.created_at,
        0 as can_edit
      FROM sales s
      WHERE s.paid_amount > 0
        AND NOT EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id)

      UNION ALL

      SELECT
        o.id,
        'owner' as source,
        CASE WHEN o.txn_kind='return' AND o.linked_withdrawal_id IS NOT NULL THEN COALESCE(w.txn_date, o.txn_date) ELSE o.txn_date END as txn_date,
        CASE WHEN o.txn_kind='withdraw' THEN 'expense' ELSE 'income' END as entry_type,
        'cash' as payment_method,
        '' as bank_name,
        CASE WHEN o.txn_kind='withdraw' THEN 'Owner Withdrawal' ELSE 'Owner Return' END as title,
        CASE
          WHEN o.txn_kind='return' AND w.txn_date IS NOT NULL THEN (o.owner_name || ' (linked to ' || w.txn_date || ')')
          ELSE o.owner_name
        END as description,
        o.amount as amount,
        COALESCE(o.notes, '') as notes,
        o.created_at,
        0 as can_edit
      FROM owner_ledger o
      LEFT JOIN owner_ledger w ON w.id=o.linked_withdrawal_id
    ) tx
    ${where}
    ORDER BY txn_date DESC, created_at DESC, id DESC
  `).all(...params);

  const summary = rows.reduce((acc, r) => {
    if (r.entry_type === 'income') acc.total_income += r.amount || 0;
    else acc.total_expense += r.amount || 0;
    return acc;
  }, { total_income: 0, total_expense: 0 });
  summary.net_balance = summary.total_income - summary.total_expense;

  return { rows, summary };
}

function forceRebindCriticalIpcHandlers() {
  const bind = (channel, fn) => {
    try { ipcMain.removeHandler(channel); } catch (_) {}
    ipcMain.handle(channel, fn);
  };
  bind('get-owner-withdrawals', (_, { ownerName = '' } = {}) => queryOwnerWithdrawals(ownerName));
  bind('get-owner-ledger', (_, params = {}) => queryOwnerLedger(params));
  bind('save-owner-entry', (_, payload = {}) => persistOwnerEntry(payload));
  bind('get-account-transactions', (_, params = {}) => queryAccountTransactions(params));
  bind('add-sale-payment', (_, payload = {}) => persistSalePayment(payload));
  bind('get-sale-payments', (_, saleId) => querySalePayments(saleId));
  bind('add-daily-khata-entry', (_, payload = {}) => {
    try { return ipcMain._addDailyKhataEntryHandler(_, payload); } catch (e) { return null; }
  });
  bind('update-daily-khata-entry', (_, payload = {}) => {
    try { return ipcMain._updateDailyKhataEntryHandler(_, payload); } catch (e) { return null; }
  });
  bind('get-daily-khata-entries', (_, params = {}) => {
    try { return queryDailyKhataEntries(params); } catch (e) { return { rows: [] }; }
  });
  bind('get-daily-khata-summary', (_, params = {}) => {
    try { return queryDailyKhataSummary(params); } catch (e) { return { total_entries: 0, total_amount: 0, avg_amount: 0, last_entry_date: null }; }
  });
  bind('delete-daily-khata-entry', (_, id) => {
    try { return ipcMain._deleteDailyKhataEntryHandler(_, id); } catch (e) { return { success: false }; }
  });

  // ---- FLEX handlers ----
  bind('get-flex-stats',          ()        => _flexGetStats());
  bind('save-flex-bill',          (_, p)    => _flexSaveBill(p));
  bind('get-flex-bills',          (_, p)    => _flexGetBills(p));
  bind('update-flex-bill',        (_, p)    => _flexUpdateBill(p));
  bind('delete-flex-bill',        (_, id)   => {
    ensureFlexTables();
    db.prepare('DELETE FROM flex_bills WHERE id=?').run(Number(id));
    return { success: true };
  });
  bind('add-flex-payment',        (_, p)    => _flexAddPayment(p));
  bind('get-flex-payments',       (_, id)   => {
    ensureFlexTables();
    const n = Number(id);
    if (!n) return [];
    return db.prepare('SELECT * FROM flex_payments WHERE flex_bill_id=? ORDER BY payment_date DESC, id DESC').all(n);
  });
  bind('delete-flex-payment',     (_, id)   => {
    ensureFlexTables();
    const p = db.prepare('SELECT * FROM flex_payments WHERE id=?').get(Number(id));
    if (!p) return { success: true };
    db.prepare('DELETE FROM flex_payments WHERE id=?').run(Number(id));
    recalcFlexBill(p.flex_bill_id);
    return { success: true };
  });
  bind('save-flex-expense',       (_, p)    => _flexSaveExpense(p));
  bind('get-flex-expenses',       (_, p)    => {
    ensureFlexTables();
    let w = 'WHERE 1=1'; const a = [];
    if (p?.dateFrom) { w += ' AND expense_date >= ?'; a.push(p.dateFrom); }
    if (p?.dateTo)   { w += ' AND expense_date <= ?'; a.push(p.dateTo); }
    return db.prepare(`SELECT * FROM flex_expenses ${w} ORDER BY expense_date DESC, id DESC`).all(...a);
  });
  bind('delete-flex-expense',     (_, id)   => {
    ensureFlexTables();
    db.prepare('DELETE FROM flex_expenses WHERE id=?').run(Number(id));
    return { success: true };
  });
  bind('get-flex-monthly-report', (_, p)    => _flexGetMonthlyReport(p));
  bind('get-flex-clients',        (_)       => _flexGetClients());
  bind('get-flex-account-transactions', (_, p) => _flexGetAccountTransactions(p));

  console.log('[IPC] Critical handlers bound: owner ledger, accounts, sale payments, daily-khata endpoints, flex module endpoints');
}

// Safeguard handlers for current data paths to avoid binding issues in older runtime states
ipcMain._addDailyKhataEntryHandler = (_, payload = {}) => {
  ensureDailyKhataTable();
  const entryDate = String(payload.entry_date || '').trim() || new Date().toISOString().slice(0, 10);
  const entryTime = normalizeKhataTime(payload.entry_time);
  const itemName = String(payload.item_name || '').trim();
  const quantityDetails = String(payload.quantity_details || '').trim();
  const amount = parseFloat(payload.amount) || 0;
  const notes = String(payload.notes || '');
  if (!entryDate) throw new Error('Entry date is required.');
  if (!itemName) throw new Error('Entry name is required.');
  if (amount <= 0) throw new Error('Amount must be greater than zero.');
  const res = db.prepare(`INSERT INTO daily_khata_entries (entry_date, entry_time, item_name, quantity_details, amount, notes) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(entryDate, entryTime, itemName, quantityDetails, amount, notes);
  return { success: true, id: res.lastInsertRowid };
};

ipcMain._updateDailyKhataEntryHandler = (_, payload = {}) => {
  ensureDailyKhataTable();
  const id = Number(payload.id);
  if (!id) throw new Error('Invalid entry id.');
  const current = db.prepare(`SELECT * FROM daily_khata_entries WHERE id=?`).get(id);
  if (!current) throw new Error('Daily khata entry not found.');
  const entryDate = String(payload.entry_date || '').trim() || current.entry_date;
  const entryTime = normalizeKhataTime(payload.entry_time || current.entry_time);
  const itemName = String(payload.item_name || current.item_name || '').trim();
  const quantityDetails = String(payload.quantity_details ?? current.quantity_details ?? '').trim();
  const amount = parseFloat(payload.amount);
  const safeAmount = Number.isFinite(amount) ? amount : (parseFloat(current.amount) || 0);
  const notes = String(payload.notes ?? current.notes ?? '');
  if (!entryDate) throw new Error('Entry date is required.');
  if (!itemName) throw new Error('Entry name is required.');
  if (safeAmount <= 0) throw new Error('Amount must be greater than zero.');
  db.prepare(`UPDATE daily_khata_entries SET entry_date=?, entry_time=?, item_name=?, quantity_details=?, amount=?, notes=? WHERE id=?`)
    .run(entryDate, entryTime, itemName, quantityDetails, safeAmount, notes, id);
  return { success: true };
};

ipcMain._deleteDailyKhataEntryHandler = (_, id) => {
  ensureDailyKhataTable();
  const entryId = Number(id);
  if (!entryId) throw new Error('Invalid entry id.');
  db.prepare(`DELETE FROM daily_khata_entries WHERE id=?`).run(entryId);
  return { success: true };
};


// ==================== WINDOW ====================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1100, minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    icon: path.join(__dirname, 'icon.png')
  });
  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
  // mainWindow.webContents.openDevTools();
}

// ==================== IPC HANDLERS ====================

ipcMain.handle('get-settings', () => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
});

ipcMain.handle('save-settings', (_, s) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)');
  db.transaction(() => { for (const [k, v] of Object.entries(s)) stmt.run(k, v); })();
  return { success: true };
});

ipcMain.handle('save-sale', (_, saleData) => {
  ensureSalePaymentTable();
  const { customer_name, customer_phone, items, discount, paid_amount, payment_method, notes, sale_date } = saleData;
  const subtotal = items.reduce((s, i) => s + i.total_price, 0);
  const disc = parseFloat(discount) || 0;
  const total = subtotal - disc;
  const paid = parseFloat(paid_amount) || 0;
  const balance = total - paid;
  const bill_no = generateBillNo();
  const sd = sale_date || new Date().toISOString().slice(0, 10);

  const insSale = db.prepare(`INSERT INTO sales (bill_no,customer_name,customer_phone,total_amount,discount,paid_amount,payment_method,balance,notes,sale_date) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insItem = db.prepare(`INSERT INTO sale_items (sale_id,category,description,width_inch,height_inch,sq_ft,quantity,unit_price,total_price) VALUES (?,?,?,?,?,?,?,?,?)`);
  const insPayment = db.prepare(`INSERT INTO sale_payments (sale_id,payment_date,amount,payment_method,notes) VALUES (?,?,?,?,?)`);

  const saleId = db.transaction(() => {
    const res = insSale.run(
      bill_no,
      customer_name || '',
      customer_phone || '',
      total,
      disc,
      paid,
      normalizePaymentMethod(payment_method),
      balance,
      notes || '',
      sd
    );
    const sid = res.lastInsertRowid;
    for (const item of items) {
      insItem.run(sid, item.category, item.description || '', item.width_inch || 0, item.height_inch || 0, item.sq_ft || 0, item.quantity || 1, item.unit_price, item.total_price);
    }
    if (paid > 0) {
      insPayment.run(sid, sd, paid, normalizePaymentMethod(payment_method), 'Initial payment');
    }
    return sid;
  })();

  return { success: true, sale_id: saleId, bill_no };
});

ipcMain.handle('update-sale', (_, { id, customer_name, customer_phone, items, discount, paid_amount, payment_method, notes, sale_date }) => {
  ensureSalePaymentTable();
  const subtotal = items.reduce((s, i) => s + i.total_price, 0);
  const disc = parseFloat(discount) || 0;
  const total = subtotal - disc;
  const paid = parseFloat(paid_amount) || 0;
  const balance = total - paid;

  const updSale = db.prepare(`UPDATE sales SET customer_name=?,customer_phone=?,total_amount=?,discount=?,paid_amount=?,payment_method=?,balance=?,notes=?,sale_date=? WHERE id=?`);
  const delItems = db.prepare('DELETE FROM sale_items WHERE sale_id=?');
  const insItem = db.prepare(`INSERT INTO sale_items (sale_id,category,description,width_inch,height_inch,sq_ft,quantity,unit_price,total_price) VALUES (?,?,?,?,?,?,?,?,?)`);
  const delPayments = db.prepare('DELETE FROM sale_payments WHERE sale_id=?');
  const insPayment = db.prepare(`INSERT INTO sale_payments (sale_id,payment_date,amount,payment_method,notes) VALUES (?,?,?,?,?)`);

  db.transaction(() => {
    updSale.run(customer_name || '', customer_phone || '', total, disc, paid, normalizePaymentMethod(payment_method), balance, notes || '', sale_date, id);
    delItems.run(id);
    for (const item of items) {
      insItem.run(id, item.category, item.description || '', item.width_inch || 0, item.height_inch || 0, item.sq_ft || 0, item.quantity || 1, item.unit_price, item.total_price);
    }
    delPayments.run(id);
    if (paid > 0) {
      insPayment.run(id, sale_date || new Date().toISOString().slice(0, 10), paid, normalizePaymentMethod(payment_method), 'Updated sale payment');
    }
  })();

  return { success: true };
});

ipcMain.handle('add-sale-payment', (_, payload = {}) => {
  return persistSalePayment(payload);
});

ipcMain.handle('get-sale-payments', (_, saleId) => {
  return querySalePayments(saleId);
});

ipcMain.handle('get-dashboard-stats', () => {
  ensureDailyKhataTable();
  const todayS = db.prepare(`SELECT COUNT(*) as total_sales, COALESCE(SUM(total_amount),0) as total_revenue, COALESCE(SUM(paid_amount),0) as collected, COALESCE(SUM(balance),0) as pending FROM sales WHERE sale_date = date('now','localtime')`).get();
  const monthS = db.prepare(`SELECT COUNT(*) as total_sales, COALESCE(SUM(total_amount),0) as total_revenue, COALESCE(SUM(paid_amount),0) as collected, COALESCE(SUM(balance),0) as pending FROM sales WHERE strftime('%Y-%m',sale_date) = strftime('%Y-%m','now','localtime')`).get();
  const todayKhata = db.prepare(`SELECT COUNT(*) as total_entries, COALESCE(SUM(amount),0) as total_amount FROM daily_khata_entries WHERE entry_date=date('now','localtime')`).get();
  const monthKhata = db.prepare(`SELECT COUNT(*) as total_entries, COALESCE(SUM(amount),0) as total_amount FROM daily_khata_entries WHERE strftime('%Y-%m',entry_date)=strftime('%Y-%m','now','localtime')`).get();
  const khataDaily = db.prepare(`
    SELECT
      entry_date,
      COUNT(*) as total_entries,
      COALESCE(SUM(amount),0) as total_amount
    FROM daily_khata_entries
    WHERE strftime('%Y-%m',entry_date)=strftime('%Y-%m','now','localtime')
    GROUP BY entry_date
    ORDER BY entry_date DESC
  `).all();
  const recentSales = db.prepare(`SELECT id,bill_no,customer_name,total_amount,paid_amount,balance,sale_date FROM sales ORDER BY id DESC LIMIT 8`).all();
  const last12 = db.prepare(`SELECT strftime('%Y-%m', sale_date) as month, COALESCE(SUM(total_amount),0) as revenue, COUNT(*) as sales FROM sales WHERE sale_date >= date('now','-11 months','start of month','localtime') GROUP BY strftime('%Y-%m', sale_date) ORDER BY month`).all();
  const catBreak = db.prepare(`SELECT si.category, COUNT(*) as cnt, COALESCE(SUM(si.total_price),0) as revenue FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE strftime('%Y-%m',s.sale_date)=strftime('%Y-%m','now','localtime') GROUP BY si.category`).all();

  return {
    today: { ...todayS },
    month: { ...monthS },
    khata: { today: todayKhata, month: monthKhata, daily: khataDaily },
    recentSales, last12, catBreak
  };
});

ipcMain.handle('get-sales', (_, { page = 1, limit = 20, search = '', dateFrom = '', dateTo = '' } = {}) => {
  const offset = (page - 1) * limit;
  let where = 'WHERE 1=1';
  const params = [];
  if (search) { where += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR bill_no LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (dateFrom) { where += ' AND sale_date >= ?'; params.push(dateFrom); }
  if (dateTo) { where += ' AND sale_date <= ?'; params.push(dateTo); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM sales ${where}`).get(...params).c;
  const sales = db.prepare(`SELECT * FROM sales ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { sales, total, page, limit };
});

ipcMain.handle('get-sale-detail', (_, id) => {
  ensureSalePaymentTable();
  const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(id);
  if (!sale) return null;
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id=? ORDER BY id').all(id);
  const payments = db.prepare('SELECT * FROM sale_payments WHERE sale_id=? ORDER BY payment_date, id').all(id);
  return { ...sale, items, payments };
});

ipcMain.handle('delete-sale', (_, id) => {
  db.prepare('DELETE FROM sales WHERE id=?').run(id);
  return { success: true };
});

ipcMain.handle('get-monthly-report', (_, { year, month } = {}) => {
  ensureDailyKhataTable();
  const now = new Date();
  const y = year || now.getFullYear();
  const m = month || String(now.getMonth() + 1).padStart(2, '0');
  const ym = `${y}-${m}`;

  const summary = db.prepare(`SELECT COUNT(*) as total_bills, COALESCE(SUM(total_amount),0) as total_revenue, COALESCE(SUM(paid_amount),0) as total_collected, COALESCE(SUM(balance),0) as total_pending, COALESCE(SUM(discount),0) as total_discount FROM sales WHERE strftime('%Y-%m',sale_date)=?`).get(ym);
  const sqFt = db.prepare(`SELECT COALESCE(SUM(si.sq_ft*si.quantity),0) as sq_ft FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE strftime('%Y-%m',s.sale_date)=?`).get(ym);
  const daily = db.prepare(`SELECT sale_date, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as revenue, COALESCE(SUM(paid_amount),0) as collected FROM sales WHERE strftime('%Y-%m',sale_date)=? GROUP BY sale_date ORDER BY sale_date`).all(ym);
  const catBreak = db.prepare(`SELECT si.category, COUNT(*) as cnt, COALESCE(SUM(si.total_price),0) as revenue, COALESCE(SUM(si.sq_ft*si.quantity),0) as sq_ft FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE strftime('%Y-%m',s.sale_date)=? GROUP BY si.category`).all(ym);
  const allSales = db.prepare(`SELECT * FROM sales WHERE strftime('%Y-%m',sale_date)=? ORDER BY sale_date,id`).all(ym);
  const khataSummary = db.prepare(`
    SELECT
      COUNT(*) as total_entries,
      COALESCE(SUM(amount),0) as total_amount,
      COALESCE(AVG(amount),0) as avg_amount
    FROM daily_khata_entries
    WHERE strftime('%Y-%m',entry_date)=?
  `).get(ym);
  const khataDaily = db.prepare(`
    SELECT
      entry_date,
      COUNT(*) as total_entries,
      COALESCE(SUM(amount),0) as total_amount
    FROM daily_khata_entries
    WHERE strftime('%Y-%m',entry_date)=?
    GROUP BY entry_date
    ORDER BY entry_date
  `).all(ym);
  const khataEntries = db.prepare(`
    SELECT * FROM daily_khata_entries
    WHERE strftime('%Y-%m',entry_date)=?
    ORDER BY entry_date, entry_time, id
  `).all(ym);

  return { summary: { ...summary, total_sq_ft: sqFt.sq_ft }, daily, catBreak, allSales, ym, khataSummary, khataDaily, khataEntries };
});

ipcMain.handle('save-pdf', async (_, { htmlContent, filename, subfolder }) => {
  if (!htmlContent || typeof htmlContent !== 'string') {
    throw new Error('Invalid PDF content.');
  }

  const safeNameBase = String(filename || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'document';
  const safeFilename = safeNameBase.toLowerCase().endsWith('.pdf') ? safeNameBase : `${safeNameBase}.pdf`;
  const docsPath = app.getPath('documents');
  const pdfDir = path.join(docsPath, subfolder || 'Abdullah Shop - Reports');
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
  const filePath = path.join(pdfDir, safeFilename);

  let win;
  try {
    win = new BrowserWindow({
      width: 794,
      height: 1123,
      show: false,
      parent: (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : undefined,
      webPreferences: {
        nodeIntegration: false,
        sandbox: true,
        javascript: false
      }
    });

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    if (win.isDestroyed()) throw new Error('PDF window closed unexpectedly.');

    const pdfBuf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    });

    fs.writeFileSync(filePath, pdfBuf);
    return { success: true, path: filePath, dir: pdfDir };
  } catch (err) {
    throw new Error('PDF save failed: ' + (err && err.message ? err.message : 'Unknown error'));
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
  }
});

ipcMain.handle('open-folder', (_, folderPath) => {
  shell.openPath(folderPath);
  return { success: true };
});

ipcMain.handle('add-product-bill', (_, { sale_date, category, product_name, quantity, cost_price, sale_price, notes }) => {
  const stmt = db.prepare(`INSERT INTO product_bills (sale_date, category, product_name, quantity, cost_price, sale_price, notes) VALUES (?,?,?,?,?,?,?)`);
  const res = stmt.run(
    sale_date,
    category || '',
    product_name,
    parseFloat(quantity) || 1,
    parseFloat(cost_price) || 0,
    parseFloat(sale_price) || 0,
    notes || ''
  );
  return { success: true, id: res.lastInsertRowid };
});

ipcMain.handle('get-product-bill', (_, id) => {
  return db.prepare('SELECT * FROM product_bills WHERE id=?').get(id) || null;
});

ipcMain.handle('update-product-bill', (_, { id, sale_date, category, product_name, quantity, cost_price, sale_price, notes }) => {
  const stmt = db.prepare(`
    UPDATE product_bills
    SET sale_date=?, category=?, product_name=?, quantity=?, cost_price=?, sale_price=?, notes=?
    WHERE id=?
  `);
  stmt.run(
    sale_date,
    category || '',
    product_name,
    parseFloat(quantity) || 1,
    parseFloat(cost_price) || 0,
    parseFloat(sale_price) || 0,
    notes || '',
    id
  );
  return { success: true };
});

ipcMain.handle('get-product-bills', (_, { dateFrom = '', dateTo = '', search = '' } = {}) => {
  let where = 'WHERE 1=1';
  const params = [];
  if (dateFrom) { where += ' AND sale_date >= ?'; params.push(dateFrom); }
  if (dateTo)   { where += ' AND sale_date <= ?'; params.push(dateTo); }
  if (search)   { where += ' AND (product_name LIKE ? OR notes LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  return db.prepare(`SELECT * FROM product_bills ${where} ORDER BY sale_date DESC, id DESC`).all(...params);
});

ipcMain.handle('delete-product-bill', (_, id) => {
  db.prepare('DELETE FROM product_bills WHERE id=?').run(id);
  return { success: true };
});

ipcMain.handle('add-daily-khata-entry', (_, payload = {}) => {
  ensureDailyKhataTable();
  const entryDate = String(payload.entry_date || '').trim() || new Date().toISOString().slice(0, 10);
  const entryTime = normalizeKhataTime(payload.entry_time);
  const itemName = String(payload.item_name || '').trim();
  const quantityDetails = String(payload.quantity_details || '').trim();
  const amount = parseFloat(payload.amount) || 0;
  const notes = String(payload.notes || '');

  if (!entryDate) throw new Error('Entry date is required.');
  if (!itemName) throw new Error('Entry name is required.');
  if (amount <= 0) throw new Error('Amount must be greater than zero.');

  const res = db.prepare(`
    INSERT INTO daily_khata_entries (entry_date, entry_time, item_name, quantity_details, amount, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entryDate, entryTime, itemName, quantityDetails, amount, notes);
  return { success: true, id: res.lastInsertRowid };
});

ipcMain.handle('update-daily-khata-entry', (_, payload = {}) => {
  ensureDailyKhataTable();
  const id = Number(payload.id);
  if (!id) throw new Error('Invalid entry id.');
  const current = db.prepare(`SELECT * FROM daily_khata_entries WHERE id=?`).get(id);
  if (!current) throw new Error('Daily khata entry not found.');

  const entryDate = String(payload.entry_date || '').trim() || current.entry_date;
  const entryTime = normalizeKhataTime(payload.entry_time || current.entry_time);
  const itemName = String(payload.item_name || current.item_name || '').trim();
  const quantityDetails = String(payload.quantity_details ?? current.quantity_details ?? '').trim();
  const amount = parseFloat(payload.amount);
  const safeAmount = Number.isFinite(amount) ? amount : (parseFloat(current.amount) || 0);
  const notes = String(payload.notes ?? current.notes ?? '');

  if (!entryDate) throw new Error('Entry date is required.');
  if (!itemName) throw new Error('Entry name is required.');
  if (safeAmount <= 0) throw new Error('Amount must be greater than zero.');

  db.prepare(`
    UPDATE daily_khata_entries
    SET entry_date=?, entry_time=?, item_name=?, quantity_details=?, amount=?, notes=?
    WHERE id=?
  `).run(entryDate, entryTime, itemName, quantityDetails, safeAmount, notes, id);
  return { success: true };
});

ipcMain.handle('get-daily-khata-entries', (_, params = {}) => {
  return queryDailyKhataEntries(params);
});

ipcMain.handle('get-daily-khata-summary', (_, params = {}) => {
  return queryDailyKhataSummary(params);
});

ipcMain.handle('delete-daily-khata-entry', (_, id) => {
  ensureDailyKhataTable();
  const entryId = Number(id);
  if (!entryId) throw new Error('Invalid entry id.');
  db.prepare(`DELETE FROM daily_khata_entries WHERE id=?`).run(entryId);
  return { success: true };
});

ipcMain.handle('get-profit-loss-summary', (_, { dateFrom = '', dateTo = '' } = {}) => {
  let where = 'WHERE 1=1';
  const params = [];
  if (dateFrom) { where += ' AND sale_date >= ?'; params.push(dateFrom); }
  if (dateTo)   { where += ' AND sale_date <= ?'; params.push(dateTo); }

  return db.prepare(`
    SELECT
      COUNT(*) as total_records,
      COALESCE(SUM(quantity * sale_price), 0)  as total_revenue,
      COALESCE(SUM(quantity * cost_price), 0)  as total_expense,
      COALESCE(SUM(quantity * (sale_price - cost_price)), 0) as net_profit
    FROM product_bills
    ${where}
  `).get(...params);
});

ipcMain.handle('get-products', () => {
  return db.prepare('SELECT * FROM products ORDER BY category, name').all();
});

ipcMain.handle('save-product', (_, { name, category, unit_price }) => {
  const stmt = db.prepare('INSERT INTO products (name, category, unit_price) VALUES (?, ?, ?)');
  const res = stmt.run(name, category, parseFloat(unit_price) || 0);
  return { success: true, id: res.lastInsertRowid };
});

ipcMain.handle('delete-product', (_, id) => {
  db.prepare('DELETE FROM products WHERE id=?').run(id);
  return { success: true };
});

ipcMain.handle('get-daily-report', (_, { date } = {}) => {
  ensureDailyKhataTable();
  const d = date || new Date().toISOString().slice(0, 10);
  const summary = db.prepare(`SELECT COUNT(*) as total_bills, COALESCE(SUM(total_amount),0) as total_revenue, COALESCE(SUM(paid_amount),0) as total_collected, COALESCE(SUM(balance),0) as total_pending, COALESCE(SUM(discount),0) as total_discount FROM sales WHERE sale_date=?`).get(d);
  const sqFt = db.prepare(`SELECT COALESCE(SUM(si.sq_ft*si.quantity),0) as sq_ft FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.sale_date=?`).get(d);
  const catBreak = db.prepare(`SELECT si.category, COUNT(*) as cnt, COALESCE(SUM(si.total_price),0) as revenue, COALESCE(SUM(si.sq_ft*si.quantity),0) as sq_ft FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.sale_date=? GROUP BY si.category`).all(d);
  const allSales = db.prepare(`SELECT * FROM sales WHERE sale_date=? ORDER BY id`).all(d);
  const khataSummary = db.prepare(`
    SELECT
      COUNT(*) as total_entries,
      COALESCE(SUM(amount),0) as total_amount,
      COALESCE(AVG(amount),0) as avg_amount
    FROM daily_khata_entries
    WHERE entry_date=?
  `).get(d);
  const khataEntries = db.prepare(`
    SELECT * FROM daily_khata_entries
    WHERE entry_date=?
    ORDER BY entry_time, id
  `).all(d);
  return { summary: { ...summary, total_sq_ft: sqFt.sq_ft }, catBreak, allSales, date: d, khataSummary, khataEntries };
});

ipcMain.handle('get-owner-withdrawals', (_, { ownerName = '' } = {}) => {
  ensureFinancialTables();
  let where = `WHERE w.txn_kind='withdraw'`;
  const params = [];
  if (ownerName) { where += ` AND w.owner_name=?`; params.push(ownerName); }

  return db.prepare(`
    SELECT
      w.id,
      w.owner_name,
      w.txn_date,
      w.amount,
      w.notes,
      COALESCE(SUM(r.amount), 0) as returned_amount,
      (w.amount - COALESCE(SUM(r.amount), 0)) as balance_amount
    FROM owner_ledger w
    LEFT JOIN owner_ledger r
      ON r.txn_kind='return' AND r.linked_withdrawal_id=w.id
    ${where}
    GROUP BY w.id, w.owner_name, w.txn_date, w.amount, w.notes
    ORDER BY w.txn_date DESC, w.id DESC
  `).all(...params);
});

ipcMain.handle('get-owner-ledger', (_, { ownerName = '', dateFrom = '', dateTo = '' } = {}) => {
  ensureFinancialTables();
  const groupDateExpr = `CASE WHEN o.txn_kind='return' AND o.linked_withdrawal_id IS NOT NULL THEN COALESCE(w.txn_date, o.txn_date) ELSE o.txn_date END`;
  let where = 'WHERE 1=1';
  const params = [];
  if (ownerName) { where += ' AND o.owner_name=?'; params.push(ownerName); }
  if (dateFrom) { where += ` AND ${groupDateExpr} >= ?`; params.push(dateFrom); }
  if (dateTo)   { where += ` AND ${groupDateExpr} <= ?`; params.push(dateTo); }

  const rows = db.prepare(`
    SELECT
      o.id,
      o.owner_name,
      o.txn_date,
      o.txn_kind,
      o.amount,
      o.linked_withdrawal_id,
      o.notes,
      o.created_at,
      ${groupDateExpr} as group_date,
      w.txn_date as linked_withdrawal_date,
      w.amount as linked_withdrawal_amount
    FROM owner_ledger o
    LEFT JOIN owner_ledger w ON w.id=o.linked_withdrawal_id
    ${where}
    ORDER BY group_date DESC, o.txn_date DESC, o.id DESC
  `).all(...params);

  const summary = rows.reduce((acc, r) => {
    if (r.txn_kind === 'withdraw') acc.total_withdraw += r.amount || 0;
    else acc.total_return += r.amount || 0;
    return acc;
  }, { total_withdraw: 0, total_return: 0 });
  summary.net_outstanding = summary.total_withdraw - summary.total_return;

  return { rows, summary };
});

ipcMain.handle('save-owner-entry', (_, payload = {}) => {
  ensureFinancialTables();
  const ownerName = String(payload.owner_name || '').trim();
  const txnDate = String(payload.txn_date || '').trim() || new Date().toISOString().slice(0, 10);
  const txnKind = payload.txn_kind === 'return' ? 'return' : 'withdraw';
  const amount = parseFloat(payload.amount) || 0;
  const notes = String(payload.notes || '');
  const linkedWithdrawalId = payload.linked_withdrawal_id ? Number(payload.linked_withdrawal_id) : null;

  if (!txnDate) throw new Error('Transaction date is required.');
  if (amount <= 0) throw new Error('Amount must be greater than zero.');

  if (txnKind === 'withdraw') {
    if (!ownerName) throw new Error('Owner name is required.');
    const res = db.prepare(`
      INSERT INTO owner_ledger (owner_name, txn_date, txn_kind, amount, notes)
      VALUES (?, ?, 'withdraw', ?, ?)
    `).run(ownerName, txnDate, amount, notes);
    return { success: true, id: res.lastInsertRowid };
  }

  if (!linkedWithdrawalId) throw new Error('Please select the related withdrawal entry.');
  const { withdrawal, balance } = getOwnerWithdrawalBalance(linkedWithdrawalId);
  if (amount > balance + 0.00001) throw new Error('Return amount exceeds remaining balance for selected withdrawal.');

  const res = db.prepare(`
    INSERT INTO owner_ledger (owner_name, txn_date, txn_kind, amount, linked_withdrawal_id, notes)
    VALUES (?, ?, 'return', ?, ?, ?)
  `).run(withdrawal.owner_name, txnDate, amount, linkedWithdrawalId, notes);
  return { success: true, id: res.lastInsertRowid };
});

ipcMain.handle('update-owner-entry', (_, payload = {}) => {
  ensureFinancialTables();
  const id = Number(payload.id);
  if (!id) throw new Error('Invalid entry id.');
  const current = db.prepare(`SELECT * FROM owner_ledger WHERE id=?`).get(id);
  if (!current) throw new Error('Owner entry not found.');

  const txnDate = String(payload.txn_date || '').trim() || current.txn_date;
  const amount = parseFloat(payload.amount) || 0;
  const notes = String(payload.notes || '');
  if (!txnDate) throw new Error('Transaction date is required.');
  if (amount <= 0) throw new Error('Amount must be greater than zero.');

  if (current.txn_kind === 'withdraw') {
    const ownerName = String(payload.owner_name || current.owner_name || '').trim();
    if (!ownerName) throw new Error('Owner name is required.');
    const { returned } = getOwnerWithdrawalBalance(id);
    if (amount + 0.00001 < returned) throw new Error('Withdrawal amount cannot be less than total returned amount.');

    db.prepare(`
      UPDATE owner_ledger
      SET owner_name=?, txn_date=?, amount=?, notes=?
      WHERE id=?
    `).run(ownerName, txnDate, amount, notes, id);
    return { success: true };
  }

  const linkedWithdrawalId = payload.linked_withdrawal_id ? Number(payload.linked_withdrawal_id) : Number(current.linked_withdrawal_id);
  if (!linkedWithdrawalId) throw new Error('Please select the related withdrawal entry.');
  const { withdrawal, balance } = getOwnerWithdrawalBalance(linkedWithdrawalId, id);
  if (amount > balance + 0.00001) throw new Error('Return amount exceeds remaining balance for selected withdrawal.');

  db.prepare(`
    UPDATE owner_ledger
    SET owner_name=?, txn_date=?, amount=?, linked_withdrawal_id=?, notes=?
    WHERE id=?
  `).run(withdrawal.owner_name, txnDate, amount, linkedWithdrawalId, notes, id);
  return { success: true };
});

ipcMain.handle('delete-owner-entry', (_, id) => {
  ensureFinancialTables();
  const entryId = Number(id);
  if (!entryId) throw new Error('Invalid entry id.');
  const row = db.prepare(`SELECT * FROM owner_ledger WHERE id=?`).get(entryId);
  if (!row) return { success: true };

  if (row.txn_kind === 'withdraw') {
    const linkedCount = db.prepare(`SELECT COUNT(*) as c FROM owner_ledger WHERE txn_kind='return' AND linked_withdrawal_id=?`).get(entryId).c;
    if (linkedCount > 0) {
      throw new Error('Delete linked return entries first, then delete this withdrawal.');
    }
  }

  db.prepare(`DELETE FROM owner_ledger WHERE id=?`).run(entryId);
  return { success: true };
});

ipcMain.handle('get-account-transactions', (_, params = {}) => {
  return queryAccountTransactions(params);
});

ipcMain.handle('get-account-payment-summary', () => {
  return queryAccountPaymentSummary();
});

ipcMain.handle('get-bank-accounts', () => {
  return getBankAccounts();
});

ipcMain.handle('save-bank-account', (_, bankName) => {
  const name = String(bankName || '').trim();
  if (!name) throw new Error('Bank name is required.');
  const list = getBankAccounts();
  const exists = list.some(n => n.toLowerCase() === name.toLowerCase());
  if (!exists) list.push(name);
  return saveBankAccounts(list);
});

ipcMain.handle('save-account-transaction', (_, payload = {}) => {
  ensureFinancialTables();
  const txnDate = String(payload.txn_date || '').trim() || new Date().toISOString().slice(0, 10);
  const entryType = payload.entry_type === 'expense' ? 'expense' : 'income';
  const paymentMethod = normalizePaymentMethod(payload.payment_method);
  const bankName = paymentMethod === 'bank_account' ? String(payload.bank_name || '').trim() : '';
  const title = String(payload.title || '').trim();
  const description = String(payload.description || '');
  const amount = parseFloat(payload.amount) || 0;
  const notes = String(payload.notes || '');

  if (!txnDate) throw new Error('Transaction date is required.');
  if (!title) throw new Error('Transaction title is required.');
  if (amount <= 0) throw new Error('Amount must be greater than zero.');
  if (paymentMethod === 'bank_account' && !bankName) throw new Error('Please select a bank account.');

  const res = db.prepare(`
    INSERT INTO account_transactions (txn_date, entry_type, payment_method, bank_name, title, description, amount, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(txnDate, entryType, paymentMethod, bankName, title, description, amount, notes);
  return { success: true, id: res.lastInsertRowid };
});

ipcMain.handle('update-account-transaction', (_, payload = {}) => {
  ensureFinancialTables();
  const id = Number(payload.id);
  if (!id) throw new Error('Invalid transaction id.');
  const current = db.prepare(`SELECT * FROM account_transactions WHERE id=?`).get(id);
  if (!current) throw new Error('Transaction not found.');

  const txnDate = String(payload.txn_date || '').trim() || current.txn_date;
  const entryType = payload.entry_type === 'expense' ? 'expense' : 'income';
  const paymentMethod = normalizePaymentMethod(payload.payment_method || current.payment_method);
  const bankName = paymentMethod === 'bank_account'
    ? String(payload.bank_name || current.bank_name || '').trim()
    : '';
  const title = String(payload.title || '').trim();
  const description = String(payload.description || '');
  const amount = parseFloat(payload.amount) || 0;
  const notes = String(payload.notes || '');

  if (!txnDate) throw new Error('Transaction date is required.');
  if (!title) throw new Error('Transaction title is required.');
  if (amount <= 0) throw new Error('Amount must be greater than zero.');
  if (paymentMethod === 'bank_account' && !bankName) throw new Error('Please select a bank account.');

  db.prepare(`
    UPDATE account_transactions
    SET txn_date=?, entry_type=?, payment_method=?, bank_name=?, title=?, description=?, amount=?, notes=?
    WHERE id=?
  `).run(txnDate, entryType, paymentMethod, bankName, title, description, amount, notes, id);
  return { success: true };
});

ipcMain.handle('delete-account-transaction', (_, id) => {
  ensureFinancialTables();
  const entryId = Number(id);
  if (!entryId) throw new Error('Invalid transaction id.');
  db.prepare(`DELETE FROM account_transactions WHERE id=?`).run(entryId);
  return { success: true };
});


// ==================== FLEX IPC (registered via forceRebind for safety) ====================
function _flexGetStats() {
  ensureFlexTables();
  const today = new Date().toISOString().slice(0, 10);
  const ym = today.slice(0, 7);
  const todayBills  = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as rev, COALESCE(SUM(paid_amount),0) as paid, COALESCE(SUM(balance),0) as pending FROM flex_bills WHERE bill_date=?`).get(today);
  const monthBills  = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as rev, COALESCE(SUM(paid_amount),0) as paid, COALESCE(SUM(balance),0) as pending FROM flex_bills WHERE strftime('%Y-%m',bill_date)=?`).get(ym);
  const outstanding = db.prepare(`SELECT COALESCE(SUM(balance),0) as bal FROM flex_bills WHERE status != 'paid'`).get();
  const todayExp    = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as exp FROM flex_expenses WHERE expense_date=?`).get(today);
  const monthExp    = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as exp FROM flex_expenses WHERE strftime('%Y-%m',expense_date)=?`).get(ym);
  const expenseDaily = db.prepare(`
    SELECT expense_date, COUNT(*) as total_entries, COALESCE(SUM(amount),0) as total_amount
    FROM flex_expenses
    WHERE strftime('%Y-%m',expense_date)=?
    GROUP BY expense_date
    ORDER BY expense_date DESC
  `).all(ym);
  const recentBills = db.prepare(`SELECT * FROM flex_bills ORDER BY bill_date DESC, id DESC LIMIT 8`).all();
  const last12 = db.prepare(`
    SELECT strftime('%Y-%m', bill_date) as month, COALESCE(SUM(total_amount),0) as revenue, COUNT(*) as bills
    FROM flex_bills
    WHERE bill_date >= date('now','-11 months','start of month','localtime')
    GROUP BY strftime('%Y-%m', bill_date)
    ORDER BY month
  `).all();
  const workTypes = db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(description), ''), 'Flex Work') as category, COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as revenue
    FROM flex_bills
    WHERE strftime('%Y-%m',bill_date)=?
    GROUP BY COALESCE(NULLIF(TRIM(description), ''), 'Flex Work')
    ORDER BY revenue DESC
    LIMIT 8
  `).all(ym);
  return {
    today: { bills: todayBills.cnt, revenue: todayBills.rev, paid: todayBills.paid, pending: todayBills.pending },
    month: { bills: monthBills.cnt, revenue: monthBills.rev, paid: monthBills.paid, pending: monthBills.pending },
    expenses: { today: todayExp, month: monthExp, daily: expenseDaily },
    outstanding: outstanding.bal,
    monthExpenses: monthExp.exp,
    recentBills,
    last12,
    workTypes
  };
}

function _flexSaveBill(payload = {}) {
  ensureFlexTables();
  const bill_date      = String(payload.bill_date || '').trim() || new Date().toISOString().slice(0, 10);
  const client_name    = String(payload.client_name || '').trim();
  const client_phone   = String(payload.client_phone || '').trim();
  const description    = String(payload.description || '').trim();
  const width_ft       = parseFloat(payload.width_ft)       || 0;
  const height_ft      = parseFloat(payload.height_ft)      || 0;
  const sq_ft          = parseFloat(payload.sq_ft)          || (width_ft * height_ft);
  const rate_per_sqft  = parseFloat(payload.rate_per_sqft)  || 0;
  const quantity       = Math.max(1, parseInt(payload.quantity) || 1);
  const total_amount   = parseFloat(payload.total_amount)   || (sq_ft * rate_per_sqft * quantity);
  const paid_amount    = parseFloat(payload.paid_amount)    || 0;
  const balance        = Math.max(0, total_amount - paid_amount);
  const payment_method = normalizePaymentMethod(payload.payment_method);
  const notes          = String(payload.notes || '');
  const status         = paid_amount <= 0 ? 'pending' : (balance <= 0.001 ? 'paid' : 'partial');
  if (!client_name)    throw new Error('Client name is required.');
  if (total_amount<=0) throw new Error('Total amount must be greater than zero.');
  const bill_no = generateFlexBillNo();
  const res = db.prepare(`INSERT INTO flex_bills (bill_no,client_name,client_phone,bill_date,description,width_ft,height_ft,sq_ft,rate_per_sqft,quantity,total_amount,paid_amount,balance,payment_method,notes,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(bill_no, client_name, client_phone, bill_date, description, width_ft, height_ft, sq_ft, rate_per_sqft, quantity, total_amount, paid_amount, balance, payment_method, notes, status);
  if (paid_amount > 0) {
    db.prepare(`INSERT INTO flex_payments (flex_bill_id,payment_date,amount,payment_method,notes) VALUES (?,?,?,?,?)`)
      .run(res.lastInsertRowid, bill_date, paid_amount, payment_method, 'Initial payment');
  }
  return { success: true, id: res.lastInsertRowid, bill_no };
}

function _flexGetBills({ dateFrom='', dateTo='', status='', search='' } = {}) {
  ensureFlexTables();
  let where = 'WHERE 1=1'; const params = [];
  if (dateFrom) { where += ' AND bill_date >= ?'; params.push(dateFrom); }
  if (dateTo)   { where += ' AND bill_date <= ?'; params.push(dateTo); }
  if (status)   { where += ' AND status = ?';     params.push(status); }
  if (search)   { where += ' AND (client_name LIKE ? OR bill_no LIKE ? OR description LIKE ?)'; params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  return db.prepare(`SELECT * FROM flex_bills ${where} ORDER BY bill_date DESC, id DESC`).all(...params);
}

function _flexUpdateBill(payload = {}) {
  ensureFlexTables();
  const id = Number(payload.id);
  if (!id) throw new Error('Invalid bill id.');
  const cur = db.prepare(`SELECT * FROM flex_bills WHERE id=?`).get(id);
  if (!cur) throw new Error('Bill not found.');
  const bill_date     = String(payload.bill_date     ?? cur.bill_date).trim();
  const client_name   = String(payload.client_name   ?? cur.client_name).trim();
  const client_phone  = String(payload.client_phone  ?? cur.client_phone).trim();
  const description   = String(payload.description   ?? cur.description);
  const width_ft      = parseFloat(payload.width_ft)      || cur.width_ft;
  const height_ft     = parseFloat(payload.height_ft)     || cur.height_ft;
  const sq_ft         = parseFloat(payload.sq_ft)         || cur.sq_ft;
  const rate_per_sqft = parseFloat(payload.rate_per_sqft) || cur.rate_per_sqft;
  const quantity      = parseInt(payload.quantity)        || cur.quantity;
  const total_amount  = parseFloat(payload.total_amount)  || cur.total_amount;
  const notes         = String(payload.notes ?? cur.notes);
  if (!client_name)    throw new Error('Client name is required.');
  if (total_amount<=0) throw new Error('Total amount must be greater than zero.');
  db.prepare(`UPDATE flex_bills SET bill_date=?,client_name=?,client_phone=?,description=?,width_ft=?,height_ft=?,sq_ft=?,rate_per_sqft=?,quantity=?,total_amount=?,notes=? WHERE id=?`)
    .run(bill_date, client_name, client_phone, description, width_ft, height_ft, sq_ft, rate_per_sqft, quantity, total_amount, notes, id);
  recalcFlexBill(id);
  return { success: true };
}

function _flexAddPayment(payload = {}) {
  ensureFlexTables();
  const flex_bill_id = Number(payload.flex_bill_id);
  if (!flex_bill_id) throw new Error('Bill id required.');
  if (!db.prepare(`SELECT id FROM flex_bills WHERE id=?`).get(flex_bill_id)) throw new Error('Bill not found.');
  const payment_date   = String(payload.payment_date || '').trim() || new Date().toISOString().slice(0, 10);
  const amount         = parseFloat(payload.amount) || 0;
  if (amount <= 0)     throw new Error('Payment amount must be greater than zero.');
  const payment_method = normalizePaymentMethod(payload.payment_method);
  const notes          = String(payload.notes || '');
  db.prepare(`INSERT INTO flex_payments (flex_bill_id,payment_date,amount,payment_method,notes) VALUES (?,?,?,?,?)`)
    .run(flex_bill_id, payment_date, amount, payment_method, notes);
  recalcFlexBill(flex_bill_id);
  return { success: true };
}

function _flexSaveExpense(payload = {}) {
  ensureFlexTables();
  const expense_date = String(payload.expense_date || '').trim() || new Date().toISOString().slice(0, 10);
  const description  = String(payload.description || '').trim();
  const amount       = parseFloat(payload.amount) || 0;
  const notes        = String(payload.notes || '');
  if (!description)  throw new Error('Description is required.');
  if (amount <= 0)   throw new Error('Amount must be greater than zero.');
  const res = db.prepare(`INSERT INTO flex_expenses (expense_date,description,amount,notes) VALUES (?,?,?,?)`)
    .run(expense_date, description, amount, notes);
  return { success: true, id: res.lastInsertRowid };
}

function _flexGetClients() {
  try {
    ensureFlexTables();
    return db.prepare(`SELECT DISTINCT client_name FROM flex_bills WHERE TRIM(client_name) != '' ORDER BY client_name COLLATE NOCASE`).all().map(r => r.client_name);
  } catch (e) {
    console.error('[Flex] _flexGetClients error:', e);
    return [];
  }
}

function _flexGetMonthlyReport({ year, month, clientName } = {}) {
  ensureFlexTables();
  const ym = `${year}-${String(month).padStart(2,'0')}`;
  const hasClient = clientName && clientName.trim();
  const bills = hasClient
    ? db.prepare(`SELECT * FROM flex_bills WHERE strftime('%Y-%m',bill_date)=? AND client_name=? ORDER BY bill_date,id`).all(ym, clientName.trim())
    : db.prepare(`SELECT * FROM flex_bills WHERE strftime('%Y-%m',bill_date)=? ORDER BY bill_date,id`).all(ym);
  const expenses = hasClient
    ? []
    : db.prepare(`SELECT * FROM flex_expenses WHERE strftime('%Y-%m',expense_date)=? ORDER BY expense_date,id`).all(ym);
  const summary = hasClient
    ? db.prepare(`SELECT COUNT(*) as total_bills, COALESCE(SUM(total_amount),0) as total_revenue, COALESCE(SUM(paid_amount),0) as total_paid, COALESCE(SUM(balance),0) as total_balance FROM flex_bills WHERE strftime('%Y-%m',bill_date)=? AND client_name=?`).get(ym, clientName.trim())
    : db.prepare(`SELECT COUNT(*) as total_bills, COALESCE(SUM(total_amount),0) as total_revenue, COALESCE(SUM(paid_amount),0) as total_paid, COALESCE(SUM(balance),0) as total_balance FROM flex_bills WHERE strftime('%Y-%m',bill_date)=?`).get(ym);
  const expTotal = hasClient
    ? 0
    : db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM flex_expenses WHERE strftime('%Y-%m',expense_date)=?`).get(ym).total;
  return { bills, expenses, summary, expTotal, ym, clientName: clientName || null };
}

function _flexGetAccountTransactions({ search = '', dateFrom = '', dateTo = '', entryType = '', paymentMethod = '' } = {}) {
  ensureFlexTables();
  let where = 'WHERE 1=1';
  const params = [];
  const normalizedMethod = paymentMethod ? normalizePaymentMethod(paymentMethod) : '';

  if (search) {
    where += ` AND (title LIKE ? OR description LIKE ? OR notes LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (dateFrom) { where += ` AND txn_date >= ?`; params.push(dateFrom); }
  if (dateTo)   { where += ` AND txn_date <= ?`; params.push(dateTo); }
  if (entryType === 'income' || entryType === 'expense') { where += ` AND entry_type = ?`; params.push(entryType); }
  if (normalizedMethod) { where += ` AND payment_method = ?`; params.push(normalizedMethod); }

  const rows = db.prepare(`
    SELECT * FROM (
      SELECT
        fp.id,
        'income' as entry_type,
        fp.payment_date as txn_date,
        COALESCE(NULLIF(fp.payment_method, ''), 'cash') as payment_method,
        ('Flex Payment ' || fb.bill_no) as title,
        ('Client: ' || COALESCE(NULLIF(fb.client_name, ''), 'Walk-in')) as description,
        fp.amount,
        COALESCE(NULLIF(fp.notes, ''), fb.description, '') as notes,
        fp.created_at
      FROM flex_payments fp
      JOIN flex_bills fb ON fb.id = fp.flex_bill_id
      WHERE fp.amount > 0

      UNION ALL

      SELECT
        fe.id,
        'expense' as entry_type,
        fe.expense_date as txn_date,
        'cash' as payment_method,
        fe.description as title,
        'Flex expense' as description,
        fe.amount,
        COALESCE(fe.notes, '') as notes,
        fe.created_at
      FROM flex_expenses fe
      WHERE fe.amount > 0
    ) tx
    ${where}
    ORDER BY txn_date DESC, created_at DESC, id DESC
  `).all(...params);

  const summary = rows.reduce((acc, r) => {
    if (r.entry_type === 'income') acc.total_income += parseFloat(r.amount) || 0;
    else acc.total_expense += parseFloat(r.amount) || 0;
    return acc;
  }, { total_income: 0, total_expense: 0 });
  summary.net_balance = summary.total_income - summary.total_expense;
  summary.outstanding = db.prepare(`SELECT COALESCE(SUM(balance),0) as total FROM flex_bills WHERE balance > 0`).get().total || 0;

  const methods = { cash: 0, jazzcash: 0, easypaisa: 0, bank_account: 0 };
  rows.filter(r => r.entry_type === 'income').forEach(r => {
    const method = normalizePaymentMethod(r.payment_method);
    methods[method] += parseFloat(r.amount) || 0;
  });

  return { rows, summary, methods };
}

ipcMain.handle('get-flex-account-transactions', (_, payload = {}) => _flexGetAccountTransactions(payload));

// ==================== APP LIFECYCLE ====================
app.whenReady().then(() => {
  console.log('[BOOT] Main loaded from:', __filename);
  initDatabase();
  forceRebindCriticalIpcHandlers();
  createWindow();
});
app.on('window-all-closed', () => {
  // Quit only when the main window closes; ignore temporary print windows
  if (process.platform !== 'darwin' && (!mainWindow || mainWindow.isDestroyed())) app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
