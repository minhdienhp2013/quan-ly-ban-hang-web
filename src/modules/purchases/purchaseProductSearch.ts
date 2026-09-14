import type { Product } from '../../types/models';

export type PurchaseProductMatchKind =
  | 'exact-qr'
  | 'exact-barcode'
  | 'exact-sku'
  | 'exact-name'
  | 'code-partial'
  | 'name-partial';

export interface PurchaseProductSearchResult {
  product: Product;
  rank: number;
  kind: PurchaseProductMatchKind;
}

function normalize(value: string | undefined) {
  return value?.trim().toLocaleLowerCase('vi') ?? '';
}

function rankProduct(product: Product, query: string): Omit<PurchaseProductSearchResult, 'product'> | null {
  const needle = normalize(query);
  if (!needle || !product.active) return null;

  const qr = normalize(product.qrCode);
  const barcode = normalize(product.barcode);
  const sku = normalize(product.sku);
  const name = normalize(product.name);

  if (qr && qr === needle) return { rank: 1, kind: 'exact-qr' };
  if (barcode && barcode === needle) return { rank: 2, kind: 'exact-barcode' };
  if (sku && sku === needle) return { rank: 3, kind: 'exact-sku' };
  if (name === needle) return { rank: 4, kind: 'exact-name' };
  if ((qr && qr.includes(needle)) || (barcode && barcode.includes(needle)) || sku.includes(needle)) {
    return { rank: 5, kind: 'code-partial' };
  }
  if (name.includes(needle)) return { rank: 6, kind: 'name-partial' };

  return null;
}

export function searchPurchaseProducts(
  products: readonly Product[],
  query: string,
  limit = 10,
): PurchaseProductSearchResult[] {
  const safeLimit = Math.max(1, Math.min(12, Math.floor(limit) || 10));
  return products
    .map((product) => {
      const match = rankProduct(product, query);
      return match ? { product, ...match } : null;
    })
    .filter((result): result is PurchaseProductSearchResult => result !== null)
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      const skuOrder = left.product.sku.localeCompare(right.product.sku, 'vi', { numeric: true });
      return skuOrder || left.product.name.localeCompare(right.product.name, 'vi');
    })
    .slice(0, safeLimit);
}
