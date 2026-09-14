import type { Product } from '../../types/models';
import {
  normalizeSearchCode,
  prepareSearchCandidate,
  prepareSearchQuery,
  type SearchAliases,
} from './searchNormalization';

export type { SearchAliases } from './searchNormalization';

export type ProductSearchMatchKind =
  | 'exact-qr'
  | 'exact-barcode'
  | 'exact-sku'
  | 'exact-name'
  | 'code-prefix'
  | 'name-prefix'
  | 'name-token'
  | 'name-compact';

export interface ProductSearchResult {
  product: Product;
  rank: number;
  kind: ProductSearchMatchKind;
}

export interface ProductSearchOptions {
  aliases?: SearchAliases;
  limit?: number;
}

export const DEFAULT_PRODUCT_SEARCH_LIMIT = 10;
export const MAX_PRODUCT_SEARCH_LIMIT = 12;

function getProductSearchRank(
  product: Product,
  query: string,
  aliases?: SearchAliases,
): Omit<ProductSearchResult, 'product'> | null {
  const codeQuery = normalizeSearchCode(query);
  if (!codeQuery) return null;

  const qr = normalizeSearchCode(product.qrCode);
  const barcode = normalizeSearchCode(product.barcode);
  const sku = normalizeSearchCode(product.sku);
  if (qr && qr === codeQuery) return { rank: 1, kind: 'exact-qr' };
  if (barcode && barcode === codeQuery) return { rank: 2, kind: 'exact-barcode' };
  if (sku && sku === codeQuery) return { rank: 3, kind: 'exact-sku' };

  const queryForms = prepareSearchQuery(query, aliases);
  const nameForms = prepareSearchCandidate(product.name);
  if (nameForms.expanded === queryForms.expanded) return { rank: 4, kind: 'exact-name' };

  if ((qr && qr.startsWith(codeQuery)) || (barcode && barcode.startsWith(codeQuery)) || sku.startsWith(codeQuery)) {
    return { rank: 5, kind: 'code-prefix' };
  }

  const hasEmbeddedQueryExpansion =
    queryForms.expanded === queryForms.normalized && queryForms.expandedCompact !== queryForms.compact;
  if (!hasEmbeddedQueryExpansion && nameForms.expanded.startsWith(queryForms.expanded)) {
    return { rank: 6, kind: 'name-prefix' };
  }

  const nameTokenSet = new Set(nameForms.tokens);
  if (queryForms.tokens.length > 0 && queryForms.tokens.every((token) => nameTokenSet.has(token))) {
    return { rank: 7, kind: 'name-token' };
  }

  if (queryForms.expandedCompact && nameForms.expandedCompact.includes(queryForms.expandedCompact)) {
    return { rank: 8, kind: 'name-compact' };
  }

  const queryCompactWasExpanded = queryForms.expandedCompact !== queryForms.compact;
  if (!queryCompactWasExpanded && queryForms.compact && nameForms.compact.includes(queryForms.compact)) {
    return { rank: 8, kind: 'name-compact' };
  }

  return null;
}

export function searchProducts(
  products: readonly Product[],
  query: string,
  options: ProductSearchOptions = {},
): ProductSearchResult[] {
  const requestedLimit = options.limit ?? DEFAULT_PRODUCT_SEARCH_LIMIT;
  const safeLimit = Math.max(1, Math.min(MAX_PRODUCT_SEARCH_LIMIT, Math.floor(requestedLimit) || DEFAULT_PRODUCT_SEARCH_LIMIT));

  return products
    .map((product) => {
      const match = getProductSearchRank(product, query, options.aliases);
      return match ? { product, ...match } : null;
    })
    .filter((result): result is ProductSearchResult => result !== null)
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      const skuOrder = left.product.sku.localeCompare(right.product.sku, 'vi', { numeric: true });
      if (skuOrder) return skuOrder;
      const nameOrder = left.product.name.localeCompare(right.product.name, 'vi');
      if (nameOrder) return nameOrder;
      return left.product.id.localeCompare(right.product.id, 'vi', { numeric: true });
    })
    .slice(0, safeLimit);
}
