import * as XLSX from 'xlsx';
import type { ReportBundle } from './reportService';
import { getSaleSnapshotCost } from './reportService';

function dateTime(value: number) {
  return Number.isFinite(value) ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(value) : '';
}

function addSheet(workbook: XLSX.WorkBook, name: string, rows: Record<string, string | number | boolean>[]) {
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Thông tin': 'Không có dữ liệu' }]);
  XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
}

export function exportReportExcel(bundle: ReportBundle) {
  const workbook = XLSX.utils.book_new();
  addSheet(workbook, 'Tong quan', [
    { 'Khoảng báo cáo': bundle.range.label, 'Doanh thu thuần': bundle.summary.revenue, 'Giá vốn': bundle.summary.costOfGoods, 'Lợi nhuận gộp': bundle.summary.grossProfit, 'Chi phí': bundle.summary.expenseTotal, 'Lợi nhuận ròng': bundle.summary.netProfit, 'Số đơn hoàn tất': bundle.summary.completedSales },
    { 'Khoảng báo cáo': 'Tồn hiện tại', 'Doanh thu thuần': 0, 'Giá vốn': 0, 'Lợi nhuận gộp': 0, 'Chi phí': 0, 'Lợi nhuận ròng': bundle.summary.inventoryValue, 'Số đơn hoàn tất': bundle.summary.inventoryQuantity },
  ]);
  addSheet(workbook, 'Ban hang', bundle.sales.map((sale) => ({
    'Mã đơn': sale.code, 'Thời gian': dateTime(sale.createdAt), 'Khách hàng': sale.customerName || 'Khách lẻ', 'Doanh thu': Number(sale.total) || 0,
    'Giá vốn snapshot': getSaleSnapshotCost(sale), 'Lợi nhuận gộp': (Number(sale.total) || 0) - getSaleSnapshotCost(sale), 'Giảm giá': Number(sale.discount) || 0,
  })));
  addSheet(workbook, 'Chi phi', bundle.expenses.map((item) => ({ 'Mã': item.code, 'Ngày': dateTime(item.expenseDate), 'Danh mục': item.category, 'Số tiền': Number(item.amount) || 0, 'Ghi chú': item.note || '' })));
  addSheet(workbook, 'Ton kho', bundle.inventory.map((item) => ({
    'SKU': item.sku, 'Tên sản phẩm': item.name, 'Đơn vị': item.unit || '', 'Tồn hiện tại': item.stockQuantity, 'Tồn tối thiểu': item.minStock ?? '',
    'Trạng thái': item.status === 'out' ? 'Hết hàng' : item.status === 'low' ? 'Sắp hết' : 'Bình thường', 'Giá vốn hiện tại': item.currentUnitCost, 'Giá trị tồn hiện tại': item.currentInventoryValue,
  })));
  addSheet(workbook, 'Nhap hang', bundle.purchases.map((item) => ({ 'Mã phiếu': item.code, 'Thời gian': dateTime(item.createdAt), 'Nhà cung cấp': item.supplierName || '', 'Tổng nhập': Number(item.total) || 0 })));
  addSheet(workbook, 'Xuat kho', bundle.stockOuts.map((item) => ({ 'Mã phiếu': item.code, 'Thời gian': dateTime(item.createdAt), 'Lý do': item.reason, 'Số dòng hàng': Array.isArray(item.items) ? item.items.length : Object.keys(item.items || {}).length })));
  addSheet(workbook, 'Bien dong kho', bundle.movements.map((item) => ({
    'Thời gian': dateTime(item.createdAt), 'Nghiệp vụ': item.type, 'Product ID': item.productId, 'Thay đổi': Number(item.quantityDelta) || 0,
    'Trước': Number(item.quantityBefore) || 0, 'Sau': Number(item.quantityAfter) || 0, 'Giá vốn snapshot': typeof item.unitCost === 'number' ? item.unitCost : '', 'Tham chiếu': item.referenceId || '',
  })));
  addSheet(workbook, 'Khach hang', bundle.customers.map((item) => ({ 'Khách hàng': item.customerName, 'Số đơn': item.orderCount, 'Doanh thu': item.revenue, 'Giá vốn': item.costOfGoods, 'Lợi nhuận gộp': item.grossProfit })));
  addSheet(workbook, 'Nha cung cap', bundle.suppliers.map((item) => ({ 'Nhà cung cấp': item.supplierName, 'Số phiếu nhập': item.purchaseCount, 'Giá trị nhập': item.purchaseTotal })));

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `bao-cao-${stamp}.xlsx`, { compression: true });
}
