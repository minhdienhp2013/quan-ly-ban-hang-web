import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dashboard = await import(new URL('../src/modules/dashboard/dashboardViewModel.ts', import.meta.url));

const {
  buildDashboardRange,
  buildPreviousDashboardRange,
  buildInventorySummary,
  buildRevenueChart,
  buildTopProducts,
  buildRecentActivity,
  getDashboardComparison,
  getDashboardQuickActions,
  getDashboardStockStatus,
  getDashboardVisibility,
  getOwnerMetrics,
  getSoldQuantity,
} = dashboard;

function item(productId, quantity, unitPrice = 10000, costPrice = 4000, name = productId) {
  return {
    productId,
    sku: `SKU-${productId}`,
    name,
    quantity,
    unitPrice,
    costPrice,
    lineTotal: quantity * unitPrice,
  };
}

function sale(id, status, createdAt, items, total = items.reduce((sum, line) => sum + line.lineTotal, 0)) {
  const costTotal = items.reduce((sum, line) => sum + line.quantity * line.costPrice, 0);
  return {
    id,
    code: `BH-${id}`,
    items,
    subtotal: total,
    discount: 0,
    total,
    costTotal,
    profit: total - costTotal,
    status,
    createdBy: 'u1',
    createdAt,
    updatedAt: createdAt,
  };
}

test('dashboard ranges keep rolling 7 calendar days without changing Reports week semantics', () => {
  const now = new Date(2026, 8, 13, 19, 8, 30, 0);
  const range = buildDashboardRange('last7', now);
  const from = new Date(range.from);
  assert.equal(from.getFullYear(), 2026);
  assert.equal(from.getMonth(), 8);
  assert.equal(from.getDate(), 7);
  assert.equal(from.getHours(), 0);
  assert.equal(range.to, now.getTime());

  const previous = buildPreviousDashboardRange('last7', now);
  const previousFrom = new Date(previous.from);
  const previousTo = new Date(previous.to);
  assert.equal(previousFrom.getMonth(), 7);
  assert.equal(previousFrom.getDate(), 31);
  assert.equal(previousTo.getMonth(), 8);
  assert.equal(previousTo.getDate(), 6);
  assert.equal(previousTo.getHours(), now.getHours());
});

test('previous-period comparison handles zero denominator without NaN or Infinity', () => {
  assert.deepEqual(getDashboardComparison(0, 0), { kind: 'none', label: '—', direction: 'flat' });
  assert.deepEqual(getDashboardComparison(100, 0), { kind: 'new', label: 'Mới', direction: 'up' });
  const zeroCurrent = getDashboardComparison(0, 100);
  assert.equal(zeroCurrent.kind, 'percent');
  assert.equal(zeroCurrent.value, -100);
  assert.equal(zeroCurrent.label, '-100%');
  assert.ok(!zeroCurrent.label.includes('Infinity'));
  assert.ok(!zeroCurrent.label.includes('NaN'));
});

test('stock LOW and OUT are mutually exclusive; negative legacy stock is OUT and no-min positive stock is OK', () => {
  const products = [
    { productId: 'ok', sku: 'OK', name: 'OK', stockQuantity: 10, minStock: 5, active: true },
    { productId: 'equal', sku: 'EQ', name: 'Equal', stockQuantity: 5, minStock: 5, active: true },
    { productId: 'low', sku: 'LOW', name: 'Low', stockQuantity: 2, minStock: 5, active: true },
    { productId: 'out', sku: 'OUT', name: 'Out', stockQuantity: 0, minStock: 5, active: true },
    { productId: 'negative', sku: 'NEG', name: 'Negative', stockQuantity: -2, minStock: 5, active: true },
    { productId: 'no-min', sku: 'NM', name: 'No min', stockQuantity: 2, active: true },
    { productId: 'inactive', sku: 'OFF', name: 'Inactive', stockQuantity: 0, minStock: 5, active: false },
  ];
  assert.equal(getDashboardStockStatus(products[1]), 'low');
  assert.equal(getDashboardStockStatus(products[3]), 'out');
  assert.equal(getDashboardStockStatus(products[4]), 'out');
  assert.equal(getDashboardStockStatus(products[5]), 'ok');
  assert.equal(getDashboardStockStatus(products[6]), 'inactive');
  assert.deepEqual(buildInventorySummary(products), { active: 6, ok: 2, low: 2, out: 2 });
});

test('top products and sold quantity use completed Sale.items only, preserving historical snapshots', () => {
  const timestamp = new Date(2026, 8, 13, 10).getTime();
  const sales = [
    sale('1', 'completed', timestamp, [item('p1', 2, 10000, 3000, 'Tên snapshot cũ'), item('p2', 1)]),
    sale('2', 'completed', timestamp + 1000, [item('p1', 3, 12000, 3500, 'Tên snapshot mới')]),
    sale('3', 'cancelled', timestamp + 2000, [item('p1', 50)]),
    sale('4', 'refunded', timestamp + 3000, [item('p2', 60)]),
  ];
  assert.equal(getSoldQuantity(sales), 6);
  const top = buildTopProducts(sales, 10);
  assert.equal(top.length, 2);
  assert.equal(top[0].productId, 'p1');
  assert.equal(top[0].quantity, 5);
  assert.equal(top[0].orderCount, 2);
  assert.equal(top[0].name, 'Tên snapshot mới');
  assert.equal(top[1].quantity, 1);
});

test('empty revenue chart creates zero-valued buckets and excludes cancelled/refunded sales', () => {
  const now = new Date(2026, 8, 13, 12, 0, 0, 0);
  const range = buildDashboardRange('last7', now);
  const empty = buildRevenueChart([], 'last7', range);
  assert.equal(empty.length, 7);
  assert.ok(empty.every((point) => point.value === 0));

  const timestamp = new Date(2026, 8, 13, 9).getTime();
  const points = buildRevenueChart([
    sale('ok', 'completed', timestamp, [item('p1', 1)], 25000),
    sale('cancel', 'cancelled', timestamp, [item('p1', 1)], 90000),
    sale('refund', 'refunded', timestamp, [item('p1', 1)], 80000),
  ], 'last7', range);
  assert.equal(points.reduce((sum, point) => sum + point.value, 0), 25000);
});

test('owner metrics map Reports summary and average order never divides by zero', () => {
  const summary = {
    revenue: 300000,
    costOfGoods: 120000,
    grossProfit: 180000,
    expenseTotal: 50000,
    netProfit: 130000,
    completedSales: 3,
    purchaseTotal: 0,
    stockOutValue: 0,
    inventoryQuantity: 0,
    inventoryValue: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  };
  const metrics = getOwnerMetrics(summary, []);
  assert.equal(metrics.revenue, 300000);
  assert.equal(metrics.grossProfit, 180000);
  assert.equal(metrics.expenseTotal, 50000);
  assert.equal(metrics.averageOrder, 100000);

  const zero = getOwnerMetrics({ ...summary, revenue: 0, completedSales: 0 }, []);
  assert.equal(zero.averageOrder, 0);
  assert.ok(Number.isFinite(zero.averageOrder));
});

test('OWNER gets financial widgets and Reports action; STAFF is fail-closed for financial UI', () => {
  const owner = getDashboardVisibility('owner');
  const staff = getDashboardVisibility('staff');
  assert.equal(owner.financial, true);
  assert.equal(owner.revenueChart, true);
  assert.equal(owner.topCustomers, true);
  assert.equal(owner.reportsAction, true);
  assert.equal(staff.financial, false);
  assert.equal(staff.revenueChart, false);
  assert.equal(staff.topCustomers, false);
  assert.equal(staff.reportsAction, false);

  const ownerRoutes = getDashboardQuickActions('owner').map((entry) => entry.to);
  const staffRoutes = getDashboardQuickActions('staff').map((entry) => entry.to);
  assert.deepEqual(ownerRoutes, ['/sales', '/purchases', '/stockouts', '/stocktakes', '/qr-printing', '/reports']);
  assert.deepEqual(staffRoutes, ['/sales', '/purchases', '/stockouts', '/stocktakes', '/qr-printing']);
});

test('recent activity contains completed Sale/Purchase/StockOut only', () => {
  const now = Date.now();
  const sales = [sale('sale-ok', 'completed', now - 3000, [item('p1', 1)]), sale('sale-off', 'cancelled', now, [item('p1', 1)])];
  const purchases = [
    { id: 'pur-ok', code: 'PN-OK', items: [item('p1', 1)], total: 1000, status: 'completed', createdBy: 'u', createdAt: now - 2000, updatedAt: now - 2000 },
    { id: 'pur-off', code: 'PN-OFF', items: [item('p1', 1)], total: 1000, status: 'cancelled', createdBy: 'u', createdAt: now, updatedAt: now },
  ];
  const stockOuts = [
    { id: 'out-ok', code: 'PX-OK', reason: 'other', items: [{ productId: 'p1', sku: 'P1', name: 'P1', quantity: 1, costPrice: 100 }], status: 'completed', createdBy: 'u', createdAt: now - 1000, updatedAt: now - 1000 },
    { id: 'out-off', code: 'PX-OFF', reason: 'other', items: [{ productId: 'p1', sku: 'P1', name: 'P1', quantity: 1, costPrice: 100 }], status: 'cancelled', createdBy: 'u', createdAt: now, updatedAt: now },
  ];
  const activity = buildRecentActivity(sales, purchases, stockOuts, 8);
  assert.deepEqual(activity.map((entry) => entry.id), ['stockout:out-ok', 'purchase:pur-ok', 'sale:sale-ok']);
});

test('STAFF loader does not read Expense or import transaction mutation services; Dashboard has no direct stock writes', () => {
  const service = read('src/modules/dashboard/dashboardService.ts');
  const staffStart = service.indexOf('async function loadStaffDashboard');
  const staffEnd = service.indexOf('async function loadOwnerDashboard', staffStart);
  const staffBody = service.slice(staffStart, staffEnd);
  assert.ok(staffStart >= 0 && staffEnd > staffStart);
  assert.doesNotMatch(staffBody, /readCreatedRange<[^>]+>\('expenses'|ref\([^)]*['"]expenses['"]/i);
  assert.doesNotMatch(service, /inventoryService|stockOperationCas|salesService/);
  assert.doesNotMatch(service, /\b(update|set|increment|runTransaction)\s*\(/);
  assert.match(service, /loadReport\(currentRange\)/);
  assert.match(service, /loadReport\(previousRange\)/);
});

test('Reports historical COGS and completed-only/expense contracts remain the financial source of truth', () => {
  const source = read('src/modules/reports/reportService.ts');
  const costStart = source.indexOf('export function getSaleSnapshotCost');
  const costEnd = source.indexOf('function inventoryRows', costStart);
  const costBody = source.slice(costStart, costEnd);
  assert.match(costBody, /sale\.costTotal/);
  assert.match(costBody, /item\.costPrice/);
  assert.doesNotMatch(costBody, /product\.costPrice/);
  assert.match(source, /sale\.status === 'completed'/);
  assert.match(source, /item\.status === 'completed' && inRange\(item\.expenseDate, range\)/);
  assert.match(source, /grossProfit:\s*revenue - costOfGoods/);
  assert.match(source, /netProfit:\s*revenue - costOfGoods - expenseTotal/);
  assert.match(source, /__walk_in__/);
  assert.match(source, /Khách lẻ/);
});

test('Dashboard source contains no mockup fake values and responsive CSS covers mobile/tablet/desktop contracts', () => {
  const page = read('src/pages/DashboardPage.tsx');
  const css = read('src/modules/dashboard/dashboard.css');
  assert.doesNotMatch(page, /1[.,]840[.,]000|620[.,]000|1[.,]220[.,]000|Công ty ABC|SP001/);
  assert.match(css, /\.dashboard-shell\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /@media \(max-width:\s*980px\)/);
  assert.match(css, /@media \(max-width:\s*760px\)/);
  assert.match(css, /@media \(max-width:\s*520px\)/);
  assert.match(css, /@media \(max-width:\s*360px\)/);
  assert.match(css, /\.dashboard-kpi-grid[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(css, /\.dashboard-action-card[^}]*min-height:\s*76px/s);
  assert.doesNotMatch(page, /AppLayout/);
});
