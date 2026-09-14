import type { Product } from '../../types/models';
import {
  normalizeSearchCode,
  normalizeSearchText,
  type SearchAliases,
} from '../../shared/search/searchNormalization';

export type PurchaseProductMatchKind =
  | 'exact-qr'
  | 'exact-barcode'
  | 'exact-sku'
  | 'exact-name'
  | 'code-prefix'
  | 'name-prefix'
  | 'name-token'
  | 'name-compact';

export interface PurchaseProductSearchResult {
  product: Product;
  rank: number;
  kind: PurchaseProductMatchKind;
}

function getRank(product: Product, query: string, aliases?: SearchAliases): Omit<PurchaseProductSearchResult, 'product'> | null {
  const codeQuery = normalizeSearchCode(query);
  if (!codeQuery) return null;

  const qr = normalizeSearchCode(product.qrCode);
  const barcode = normalizeSearchCode(product.barcode);
  const sku = normalizeSearchCode(product.sku);
  if (qr && qr === codeQuery) return { rank: 1, kind: 'exact-qr' };
  if (barcode && barcode === codeQuery) return { rank: 2, kind: 'exact-barcode' };
  if (sku && sku === codeQuery) return { rank: 3, kind: 'exact-sku' };

  const queryForms = normalizeSearchText(query, aliases);
  const nameForms = normalizeSearchText(product.name, aliases);
  if (nameForms.expanded === queryForms.expanded) return { rank: 4, kind: 'exact-name' };

  if ((qr && qr.startsWith(codeQuery)) || (barcode && barcode.startsWith(codeQuery)) || sku.startsWith(codeQuery)) {
    return { rank: 5, kind: 'code-prefix' };
  }

  if (nameForms.expanded.startsWith(queryForms.expanded)) return { rank: 6, kind: 'name-prefix' };

  const nameTokenSet = new Set(nameForms.tokens);
  if (queryForms.tokens.length > 0 && queryForms.tokens.every((token) => nameTokenSet.has(token))) {
    return { rank: 7, kind: 'name-token' };
  }

  if (queryForms.expandedCompact && nameForms.expandedCompact.includes(queryForms.expandedCompact)) {
    return { rank: 8, kind: 'name-compact' };
  }

  if (queryForms.compact && nameForms.compact.includes(queryForms.compact)) {
    return { rank: 8, kind: 'name-compact' };
  }

  return null;
}

export function searchPurchaseProducts(
  products: readonly Product[],
  query: string,
  aliases?: SearchAliases,
  limit = 10,
): PurchaseProductSearchResult[] {
  const safeLimit = Math.max(1, Math.min(12, Math.floor(limit) || 10));
  return products
    .filter((product) => product.active)
    .map((product) => {
      const match = getRank(product, query, aliases);
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
