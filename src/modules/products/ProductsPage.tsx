import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import type { Product } from '../../types/models';
import { findProductByScannedCode } from '../qr/productLookup';
import ProductExcelImportPanel from './ProductExcelImportPanel';
import GoodsBulkActionBar from './GoodsBulkActionBar';
import GoodsFilters from './GoodsFilters';
import GoodsKpiBar from './GoodsKpiBar';
import GoodsResponsiveList from './GoodsResponsiveList';
import GoodsTable from './GoodsTable';
import GoodsToolbar from './GoodsToolbar';
import ProductDetail from './ProductDetail';
import ProductScanDialog from './ProductScanDialog';
import {
  computeGoodsStats,
  filterGoodsProducts,
  type GoodsActiveFilter,
  type GoodsStockFilter,
} from './goodsViewModel';
import {
  createProduct,
  setProductActive,
  subscribeProducts,
  updateProduct,
  type ProductInput,
} from './productService';

interface ProductFormState {
  sku: string;
  name: string;
  barcode: string;
  qrCode: string;
  unit: string;
  costPrice: string;
  salePrice: string;
  minStock: string;
  active: boolean;
}

const emptyForm: ProductFormState = {
  sku: '',
  name: '',
  barcode: '',
  qrCode: '',
  unit: '',
  costPrice: '0',
  salePrice: '0',
  minStock: '',
  active: true,
};

function toFormState(product: Product): ProductFormState {
  return {
    sku: product.sku,
    name: product.name,
    barcode: product.barcode ?? '',
    qrCode: product.qrCode ?? '',
    unit: product.unit ?? '',
    costPrice: String(product.costPrice),
    salePrice: String(product.salePrice),
    minStock: typeof product.minStock === 'number' ? String(product.minStock) : '',
    active: product.active,
  };
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('vi');
}

function getValidationError(form: ProductFormState, products: Product[], editingId?: string): string | null {
  const sku = form.sku.trim();
  const name = form.name.trim();
  const costPrice = Number(form.costPrice);
  const salePrice = Number(form.salePrice);
  const minStock = form.minStock.trim() ? Number(form.minStock) : undefined;

  if (!sku) return 'SKU là bắt buộc.';
  if (!name) return 'Tên sản phẩm là bắt buộc.';
  if (!Number.isFinite(costPrice) || costPrice < 0) return 'Giá vốn phải là số từ 0 trở lên.';
  if (!Number.isFinite(salePrice) || salePrice < 0) return 'Giá bán phải là số từ 0 trở lên.';
  if (typeof minStock === 'number' && (!Number.isFinite(minStock) || minStock < 0)) {
    return 'Tồn tối thiểu phải là số từ 0 trở lên.';
  }

  const others = products.filter((product) => product.id !== editingId);
  if (others.some((product) => normalize(product.sku) === normalize(sku))) {
    return `SKU “${sku}” đã được sử dụng.`;
  }

  const barcode = form.barcode.trim();
  if (barcode && others.some((product) => product.barcode?.trim() === barcode)) {
    return `Barcode “${barcode}” đã được sử dụng.`;
  }

  const qrCode = form.qrCode.trim();
  if (qrCode && others.some((product) => product.qrCode?.trim() === qrCode)) {
    return `Mã QR “${qrCode}” đã được sử dụng.`;
  }

  return null;
}

function toProductInput(form: ProductFormState): ProductInput {
  return {
    sku: form.sku.trim(),
    name: form.name.trim(),
    barcode: form.barcode.trim() || undefined,
    qrCode: form.qrCode.trim() || undefined,
    unit: form.unit.trim() || undefined,
    costPrice: Number(form.costPrice),
    salePrice: Number(form.salePrice),
    minStock: form.minStock.trim() ? Number(form.minStock) : undefined,
    active: form.active,
  };
}

export default function ProductsPage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<GoodsActiveFilter>('all');
  const [stockFilter, setStockFilter] = useState<GoodsStockFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(() => new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    try {
      return subscribeProducts(
        (nextProducts) => {
          setProducts(nextProducts);
          setLoading(false);
        },
        (error) => {
          setLoadError(error.message || 'Không thể tải danh sách hồi hhóa.');
          setLoading(false);
        },
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể kết nối cơ sở dữ liệu.');
      setLoading(false);
      return undefined;
    }
  }, []);

  useEffect(() => {
    const productIds = new Set(products.map((product) => product.id));
    setSelectedProductIds((current) => {
      const next = new Set([...current].filter((id) => productIds.has(id)));
      return next.size === current.size ? current : next;
    });
    if (detailProductId && !productIds.has(detailProductId)) setDetailProductId(null);
  }, [products, detailProductId]);

  const filteredProducts = useMemo(
    () => filterGoodsProducts(products, query, activeFilter, stockFilter),
    [products, query, activeFilter, stockFilter],
  );
  const stats = useMemo(() => computeGoodsStats(products), [products]);
  const detailProduct = useMemo(
    () => products.find((product) => product.id === detailProductId) ?? null,
    [products, detailProductId],
  );
  const selectedProducts = useMemo(
    () => products.filter((product) => selectedProductIds.has(product.id)),
    [products, selectedProductIds],
  );

  function openCreate() {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError(null);
    setEditorOpen(true);
  }

  function openEdit(product: Product) {
    setDetailProductId(null);
    setEditingProduct(product);
    setForm(toFormState(product));
    setFormError(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditorOpen(false);
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appUser || saving) return;
    const validationError = getValidationError(form, products, editingProduct?.id);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const input = toProductInput(form);
      if (editingProduct) await updateProduct(editingProduct, input, appUser.uid);
      else await createProduct(input, appUser.uid);
      setEditorOpen(false);
      setEditingProduct(null);
      setForm(emptyForm);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Không thể lưu sản phẩm.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(product: Product) {
    if (!appUser || changingStatusId) return;
    const nextActive = !product.active;
    const confirmed = window.confirm(
      nextActive
        ? `Kích hoạt lại sản phẩm “${product.name}”?`4D �1ND�1