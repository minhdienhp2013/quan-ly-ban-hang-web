# DATABASE_SCHEMA — Firebase Realtime Database

Schema này là bản nền móng. Mọi thay đổi làm ảnh hưởng đường dẫn, kiểu dữ liệu hoặc quan hệ giữa module phải được AI trung tâm duyệt và cập nhật tài liệu này.

## 1. Cấu trúc cấp cao

```text
/users
/products
/categories
/sales
/purchases
/stockMovements
/stocktakes
/settings
/auditLogs
```

## 2. users

```ts
interface AppUser {
  uid: string;
  displayName: string;
  email?: string;
  role: 'owner' | 'staff';
  active: boolean;
  createdAt: number;
  updatedAt: number;
}
```

Đường dẫn:

```text
/users/{uid}
```

## 3. products

```ts
interface Product {
  id: string;
  sku: string;
  name: string;
  barcode?: string;
  qrCode?: string;
  categoryId?: string;
  unit?: string;
  costPrice: number;
  salePrice: number;
  stockQuantity: number;
  minStock?: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}
```

Quy tắc:

- `sku` phải duy nhất trong phạm vi cửa hàng.
- `barcode`/`qrCode` nếu dùng để nhận diện sản phẩm phải tránh trùng.
- `costPrice`, `salePrice` là số nguyên VND.
- `stockQuantity` là giá trị tổng hợp để đọc nhanh; lịch sử thay đổi nằm ở `stockMovements`.

## 4. categories

```ts
interface Category {
  id: string;
  name: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}
```

## 5. sales

```ts
interface SaleItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  lineTotal: number;
}

interface Sale {
  id: string;
  code: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  costTotal: number;
  profit: number;
  paymentMethod?: 'cash' | 'bank_transfer' | 'other';
  status: 'completed' | 'cancelled';
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
```

Lưu snapshot tên, SKU, giá bán và giá vốn tại thời điểm giao dịch để báo cáo lịch sử không bị thay đổi khi sản phẩm được sửa sau này.

## 6. purchases

```ts
interface PurchaseItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

interface Purchase {
  id: string;
  code: string;
  items: PurchaseItem[];
  total: number;
  supplierName?: string;
  note?: string;
  status: 'completed' | 'cancelled';
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
```

## 7. stockMovements

Đây là nhật ký thay đổi tồn kho bắt buộc.

```ts
type StockMovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'SALE_RETURN'
  | 'PURCHASE_RETURN'
  | 'STOCKTAKE_ADJUSTMENT'
  | 'MANUAL_ADJUSTMENT';

interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  referenceType?: 'sale' | 'purchase' | 'stocktake' | 'manual';
  referenceId?: string;
  note?: string;
  createdBy: string;
  createdAt: number;
}
```

`quantityDelta` dương làm tăng kho, âm làm giảm kho.

## 8. stocktakes

```ts
interface StocktakeItem {
  productId: string;
  systemQuantity: number;
  actualQuantity: number;
  difference: number;
}

interface Stocktake {
  id: string;
  code: string;
  status: 'draft' | 'completed' | 'cancelled';
  items: StocktakeItem[];
  createdBy: string;
  createdAt: number;
  completedAt?: number;
}
```

## 9. settings

```ts
interface StoreSettings {
  storeName: string;
  address?: string;
  phone?: string;
  currency: 'VND';
  defaultLabelWidthMm?: number;
  defaultLabelHeightMm?: number;
  updatedAt: number;
}
```

## 10. auditLogs

Dùng cho các hành động quan trọng như sửa sản phẩm, điều chỉnh kho, hủy đơn, thay đổi quyền.

```ts
interface AuditLog {
  id: string;
  actorUid: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary?: string;
  createdAt: number;
}
```

## 11. Nguyên tắc ghi dữ liệu

- Dùng Firebase multi-location update hoặc transaction khi một nghiệp vụ cần thay đổi nhiều vị trí có liên quan.
- Không tạo đơn bán thành công nhưng thất bại khi trừ kho mà không có cơ chế rollback/transaction thích hợp.
- Không cho client tự gán vai trò `owner`.
- Các báo cáo lịch sử phải dựa trên snapshot giao dịch, không lấy giá hiện tại của sản phẩm để tính lại quá khứ.

## 12. Chỉ mục

Khi triển khai query thực tế, Security Rules cần khai báo `.indexOn` cho các trường thường truy vấn như:

- `createdAt`
- `sku`
- `barcode`
- `qrCode`
- `status`
- `productId`

Chỉ thêm index sau khi xác định query thực tế của module để tránh cấu hình thừa.
