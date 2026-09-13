import type { Product } from '../../types/models';

export type GoodsActiveFilter = 'all' | 'active' | 'inactive';
export type GoodsStockFilter = 'all' | 'in-stock' | 'low' | 'out';
export type GoodsStockStatus = 'inactive' | 'out' | 'low' | 'in-stock';

export function normalizeGoodsSearch(value: string) {
  return value.trim().toLocaleLowerCase('vi');
}

export function getGoodsStockStatus(product: Product): GoodsStockStatus {
  if (!product.active) return 'inactive';
  if (Number(product.stockQuantity) <= 0) return 'out';
  if (
    typeof product.minStock === 'number' &&
    Number(product.stockQuantity) > 0 &&
    Number(product.stockQuantity) <= product.minStock
  ) {
    return 'low';
  }
  return 'in-stock';
}

export function getGoodsStatusLabel(product: Product) {
  const status = getGoodsStockStatus(product);
  if (status === 'inactive') return 'Ngừng KD';
  if (status === 'out') return 'Hết hàng';
  if (status === 'low') return 'Sắp hết';
  return 'Còn hàng';
}

export function filterGoodsProducts(
  products: Product[],
  query: string,
  activeFilter: GoodsActiveFilter,
  stockFilter: GoodsStockFilter,
) {
  const needle = normalizeGoodsSearch(query);

  return products.filter((product) => {
    if (activeFilter === 'active' && !product.active) return false;
    if (activeFilter === 'inactive' && product.active) return false;

    const stockStatus = getGoodsStockStatus(product);
    if (stockFilter !== 'all' && stockStatus !== stockFilter) return false;

    if (!needle) return true;
    return [product.name, product.sku, product.barcode ?? '', product.qrCode ?? '']
      .some((value) => normalizeGoodsSearch(value).includes(needle));
  });
}

export function computeGoodsStats(products: Product[]) {
  const active = products.filter((product) => product.active).length;
  const inactive = products.length - active;
  const out = products.filter(
    (product) => product.active && Number(product.stockQuantity) <= 0,
  ).length;
  const low = products.filter(
    (product) =>
      product.active &&
      Number(product.stockQuantity) > 0 &&
      typeof product.minStock === 'number' &&
      Number(product.stockQuantity) <= product.minStock,
  ).length;

  return { total: products.length, active, inactive, low, out };
}

export function formatGoodsMoney(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatGoodsQuantity(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);
}
