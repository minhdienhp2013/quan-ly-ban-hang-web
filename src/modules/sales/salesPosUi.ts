import type { Sale } from '../../types/models';

export type QuickServiceId = 'photo' | 'printing' | 'scan' | 'computer' | 'stationery' | 'other';

export interface QuickServiceTile {
  id: QuickServiceId;
  label: string;
  description: string;
  icon: string;
  tone: 'blue' | 'violet' | 'mint' | 'amber' | 'rose' | 'slate';
}

export const FIXED_SERVICE_TILES: readonly QuickServiceTile[] = [
  { id: 'photo', label: 'Photo', description: 'In ảnh, rửa ảnh', icon: '🖼️', tone: 'blue' },
  { id: 'printing', label: 'In ấn', description: 'Tài liệu, màu, khổ lớn', icon: '🖨️', tone: 'violet' },
  { id: 'scan', label: 'Scan', description: 'Quét tài liệu', icon: '📠', tone: 'mint' },
  { id: 'computer', label: 'Vi tính', description: 'Linh kiện, cài đặt', icon: '💻', tone: 'amber' },
  { id: 'stationery', label: 'Văn phòng phẩm', description: 'Bút, giấy, dụng cụ', icon: '✏️', tone: 'rose' },
  { id: 'other', label: 'Khác', description: 'Dịch vụ khác', icon: '📦', tone: 'slate' },
] as const;

export type QuickAmountParseResult =
  | { state: 'empty'; amount: null; message: '' }
  | { state: 'invalid'; amount: null; message: string }
  | { state: 'valid'; amount: number; message: '' };

export interface RecentSaleSummary {
  label: string;
  quantity: number;
  note: string;
}

const MAX_SAFE_THOUSANDS = Math.floor(Number.MAX_SAFE_INTEGER / 1000);

export function parseQuickServiceAmount(rawValue: string): QuickAmountParseResult {
  const value = rawValue.trim();
  if (!value) return { state: 'empty', amount: null, message: '' };
  if (!/^\d+$/.test(value)) {
    return { state: 'invalid', amount: null, message: 'Chỉ nhập số nguyên, không nhập dấu chấm, dấu phẩy hoặc ký tự khác.' };
  }

  const thousands = Number(value);
  if (!Number.isSafeInteger(thousands) || thousands > MAX_SAFE_THOUSANDS) {
    return { state: 'invalid', amount: null, message: 'Số tiền quá lớn để xử lý an toàn.' };
  }
  if (thousands <= 0) {
    return { state: 'invalid', amount: null, message: 'Số tiền phải lớn hơn 0.' };
  }

  return { state: 'valid', amount: thousands * 1000, message: '' };
}

export function getRecentSales(sales: readonly Sale[], limit = 4): Sale[] {
  const safeLimit = Math.max(0, Math.min(4, Math.floor(limit)));
  return [...sales].sort((left, right) => right.createdAt - left.createdAt).slice(0, safeLimit);
}

export function summarizeRecentSale(sale: Sale): RecentSaleSummary {
  // subscribeSales() normalizes persisted Firebase item collections into SaleItem[].
  // Keep this helper aligned with that existing Sales read contract instead of
  // introducing another transaction-normalization path in the POS UI.
  const items = Array.isArray(sale.items) ? sale.items : [];
  const first = items[0];
  const totalQuantity = items.reduce<number>((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const extraCount = Math.max(0, items.length - 1);
  return {
    label: first ? `${first.name}${extraCount ? ` +${extraCount}` : ''}` : sale.code,
    quantity: totalQuantity,
    note: sale.note?.trim() ?? '',
  };
}
