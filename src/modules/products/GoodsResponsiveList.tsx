import type { Product } from '../../types/models';
import {
  formatGoodsMoney,
  formatGoodsQuantity,
  getGoodsStatusLabel,
  getGoodsStockStatus,
} from './goodsViewModel';

interface GoodsResponsiveListProps {
  products: Product[];
  selectedIds: ReadonlySet<string>;
  onToggleProduct: (productId: string) => void;
  onView: (product: Product) => void;
  onEdit: (product: Product) => void;
}

export default function GoodsResponsiveList({
  products,
  selectedIds,
  onToggleProduct,
  onView,
  onEdit,
}: GoodsResponsiveListProps) {
  return (
    <div className="goods-responsive-list">
      {products.map((product) => {
        const stockStatus = getGoodsStockStatus(product);
        return (
          <article className={`goods-product-card${!product.active ? ' goods-product-card--inactive' : ''}`} key={product.id}>
            <div className="goods-product-card__top">
              <label className="goods-card-check">
                <input type="checkbox" checked={selectedIds.has(product.id)} onChange={() => onToggleProduct(product.id)} />
                <span className="sr-only">Chọn {product.name}</span>
              </label>
              <div className="goods-product-card__identity">
                <button type="button" onClick={() => onView(product)}>{product.name}</button>
                <span>{product.sku}</span>
              </div>
              <button className="goods-card-view" type="button" onClick={() => onView(product)}>Xem ›</button>
            </div>
            <div className="goods-product-card__meta">
              <strong>{formatGoodsMoney(product.salePrice)}</strong>
              <span>Tồn {formatGoodsQuantity(product.stockQuantity)}{typeof product.minStock === 'number' ? ` / min ${formatGoodsQuantity(product.minStock)}` : ''}</span>
              <span className={`goods-status goods-status--${stockStatus}`}>{getGoodsStatusLabel(product)}</span>
            </div>
            <div className="goods-product-card__actions">
              <button className="button button--secondary goods-touch" type="button" onClick={() => onView(product)}>Xem chi tiết</button>
              <button className="button button--secondary goods-touch" type="button" onClick={() => onEdit(product)}>Sửa</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
