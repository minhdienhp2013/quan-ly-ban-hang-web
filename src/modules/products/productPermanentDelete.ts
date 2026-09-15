import type { Product } from '../../types/models';

export const PRODUCT_PERMANENT_DELETE_REFERENCE_NODES = [
  'sales',
  'purchases',
  'stockOuts',
  'stockMovements',
  'stocktakes',
] as const;

export type ProductPermanentDeleteReferenceNode = typeof PRODUCT_PERMANENT_DELETE_REFERENCE_NODES[number];

export interface ProductReferenceSnapshots {
  sales: unknown;
  purchases: unknown;
  stockOuts: unknown;
  stockMovements: unknown;
  stocktakes: unknown;
}

export interface ProductPermanentDeleteBlocker {
  productId: string;
  sku: string;
  name: string;
  reasons: string[];
}

export interface ProductPermanentDeletePreflight {
  selected: number;
  canDeleteAll: boolean;
  eligibleProducts: Product[];
  blockers: ProductPermanentDeleteBlocker[];
}

function objectValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>);
}

function nestedItemsReferenceProduct(collection: unknown, productId: string) {
  return objectValues(collection).some((record) => {
    if (!record || typeof record !== 'object') return false;
    const items = (record as { items?: unknown }).items;
    return objectValues(items).some((item) => {
      if (!item || typeof item !== 'object') return false;
      return (item as { productId?: unknown }).productId === productId;
    });
  });
}

function stockMovementsReferenceProduct(collection: unknown, productId: string) {
  return objectValues(collection).some((movement) => {
    if (!movement || typeof movement !== 'object') return false;
    return (movement as { productId?: unknown }).productId === productId;
  });
}

export function findProductPermanentDeleteReferenceNodes(
  productId: string,
  references: ProductReferenceSnapshots,
): ProductPermanentDeleteReferenceNode[] {
  const matched: ProductPermanentDeleteReferenceNode[] = [];
  if (nestedItemsReferenceProduct(references.sales, productId)) matched.push('sales');
  if (nestedItemsReferenceProduct(references.purchases, productId)) matched.push('purchases');
  if (nestedItemsReferenceProduct(references.stockOuts, productId)) matched.push('stockOuts');
  if (stockMovementsReferenceProduct(references.stockMovements, productId)) matched.push('stockMovements');
  if (nestedItemsReferenceProduct(references.stocktakes, productId)) matched.push('stocktakes');
  return matched;
}

export function getProductPermanentDeleteReasons(
  product: Product,
  references: ProductReferenceSnapshots,
): string[] {
  const reasons: string[] = [];

  if (!Number.isFinite(product.stockQuantity) || product.stockQuantity !== 0) {
    reasons.push(`Còn tồn kho (${product.stockQuantity}).`);
  }

  const stockVersion = typeof product.stockVersion === 'undefined' ? 0 : product.stockVersion;
  if (!Number.isFinite(stockVersion) || stockVersion !== 0) {
    reasons.push(`stockVersion phải bằng 0 nhưng hiện là ${String(product.stockVersion)}.`);
  }

  const referenceNodes = findProductPermanentDeleteReferenceNodes(product.id, references);
  if (referenceNodes.length > 0) {
    reasons.push(`Đã có lịch sử giao dịch (${referenceNodes.join(', ')}).`);
  }

  return reasons;
}

export function buildProductPermanentDeletePreflight(
  selectedProducts: readonly Product[],
  currentProducts: readonly Product[],
  references: ProductReferenceSnapshots,
): ProductPermanentDeletePreflight {
  const currentById = new Map(currentProducts.map((product) => [product.id, product]));
  const uniqueSelected = [...new Map(selectedProducts.map((product) => [product.id, product])).values()];
  const blockers: ProductPermanentDeleteBlocker[] = [];
  const candidates: Product[] = [];

  for (const selected of uniqueSelected) {
    const current = currentById.get(selected.id);
    if (!current) {
      blockers.push({
        productId: selected.id,
        sku: selected.sku,
        name: selected.name,
        reasons: ['Sản phẩm không còn tồn tại trong danh mục hiện tại.'],
      });
      continue;
    }

    const reasons = getProductPermanentDeleteReasons(current, references);
    if (reasons.length > 0) {
      blockers.push({
        productId: current.id,
        sku: current.sku,
        name: current.name,
        reasons,
      });
      continue;
    }

    candidates.push(current);
  }

  const canDeleteAll = uniqueSelected.length > 0 && blockers.length === 0;
  return {
    selected: uniqueSelected.length,
    canDeleteAll,
    eligibleProducts: canDeleteAll ? candidates : [],
    blockers,
  };
}
