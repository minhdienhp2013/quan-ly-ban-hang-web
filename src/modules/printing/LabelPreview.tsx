import type { CSSProperties } from 'react';
import type { Product } from '../../types/models';
import { BarcodeGraphic, QrGraphic, type BarcodeKind } from './codeGraphics';
import type { LabelPaperConfig } from './labelPresets';

export interface LabelDisplayOptions {
  showName: boolean;
  showSku: boolean;
  showBarcode: boolean;
  showQr: boolean;
  showPrice: boolean;
  showUnit: boolean;
  showStoreName: boolean;
  barcodeKind: BarcodeKind;
  storeName?: string;
}

export interface PrintableLabel {
  key: string;
  product: Product;
}

interface LabelPreviewProps {
  labels: PrintableLabel[];
  config: LabelPaperConfig;
  options: LabelDisplayOptions;
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value) + ' ₫';
}

function LabelCard({ product, options }: { product: Product; options: LabelDisplayOptions }) {
  const qrValue = product.qrCode?.trim() || product.sku.trim() || product.id;
  const barcodeValue = product.barcode?.trim() || product.sku.trim();

  return (
    <article className="product-label">
      <div className="product-label__text">
        {options.showStoreName && options.storeName ? <div className="product-label__store">{options.storeName}</div> : null}
        {options.showName ? <div className="product-label__name" title={product.name}>{product.name}</div> : null}
        {options.showSku ? <div className="product-label__sku">SKU: {product.sku}</div> : null}
        {options.showPrice ? <div className="product-label__price">{formatPrice(product.salePrice)}</div> : null}
        {options.showUnit && product.unit ? <div className="product-label__unit">ĐVT: {product.unit}</div> : null}
      </div>
      <div className="product-label__codes">
        {options.showBarcode ? (
          <div className="product-label__barcode"><BarcodeGraphic value={barcodeValue} kind={options.barcodeKind} /></div>
        ) : null}
        {options.showQr ? <QrGraphic value={qrValue} /> : null}
      </div>
    </article>
  );
}

export default function LabelPreview({ labels, config, options }: LabelPreviewProps) {
  const style = {
    '--label-width': `${config.labelWidthMm}mm`,
    '--label-height': `${config.labelHeightMm}mm`,
    '--label-columns': String(config.columns),
    '--label-gap-x': `${config.gapHorizontalMm}mm`,
    '--label-gap-y': `${config.gapVerticalMm}mm`,
    '--label-margin': `${config.marginMm}mm`,
    '--sheet-width': `${config.columns * config.labelWidthMm + Math.max(0, config.columns - 1) * config.gapHorizontalMm + config.marginMm * 2}mm`,
  } as CSSProperties;

  return (
    <div className="label-preview-shell">
      <div className="label-preview-scale">
        <div className="label-print-surface" style={style} aria-label="Xem trước tem in">
          {labels.length ? labels.map((label) => <LabelCard key={label.key} product={label.product} options={options} />) : (
            <div className="label-preview-empty">Chọn sản phẩm và số lượng tem để xem trước.</div>
          )}
        </div>
      </div>
    </div>
  );
}
