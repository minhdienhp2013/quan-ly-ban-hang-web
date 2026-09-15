# DATABASE_SCHEMA — Firebase Realtime Database

Schema này là hợp đồng dữ liệu chung của toàn dự án. Mọi AI/module phải đọc trước khi code. Thay đổi đường dẫn, kiểu dữ liệu hoặc quan hệ giữa module phải được AI trung tâm duyệt trước.

## 1. Cấu trúc cấp cao

```text
/users
/products
/productDeletionLocks
/businessDataResetLock
/categories
/customers
/suppliers
/sales
/purchases
/stockOuts
/stockMovements
/stockOperations
/stocktakes
/expenses
/settings
/auditLogs
```

Doanh thu, giá vốn và lợi nhuận **không tạo nguồn dữ liệu độc lập** ở giai đoạn đầu; chúng được tính từ snapshot giao dịch bán hàng/chi phí để tránh lệch số liệu. Có thể bổ sung node tổng hợp báo cáo sau khi dữ liệu lớn.

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

Đường dẫn: `/users/{uid}`.

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
  stockVersion?: number;
  minStock?: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}
```

Quy tắc:
- `sku` duy nhất trong cửa hàng.
- `barcode`/`qrCode` nếu có phải tránh trùng.
- Tiền lưu số nguyên VND.
- `stockQuantity` chỉ là số tổng hợp đọc nhanh; mọi thay đổi phải có `stockMovements`.
- `stockVersion` là số CAS tăng đơn điệu dùng để phát hiện ghi tồn cạnh tranh. Sản phẩm cũ chưa có field này được hiểu là version `0`; sản phẩm mới khởi tạo version `0`.
- Mọi nghiệp vụ làm đổi `stockQuantity` phải ghi `stockVersion = version trước + 1` trong cùng atomic multi-location update.
- Import Excel không được âm thầm ghi đè sản phẩm trùng.

### 3.1. productDeletionLocks — khóa tạm thời cho permanent Product deletion

Đường dẫn: `/productDeletionLocks/{productId}`.

```ts
interface ProductDeletionLock {
  productId: string;
  actorUid: string;
  createdAt: number;
}
```

Đây là **operational concurrency lock tạm thời**, không phải Product database thứ hai và không được lưu business Product data tại đây.

Quy tắc contract:
- Chỉ `owner` đang active được tạo/xóa lock.
- Lock chỉ được tạo khi Product tại đúng Firebase child key tồn tại, `stockQuantity === 0`, `stockVersion` missing/`0`, và stored `Product.id` nếu có phải khớp child key.
- Lock là create-only: không overwrite lock của operation khác.
- Trong lúc lock tồn tại, mọi non-delete write vào Product tương ứng phải bị Security Rules từ chối, bao gồm metadata, active state và CAS stock write.
- Reference mới hoặc đổi `productId` tại `sales.items`, `purchases.items`, `stockOuts.items`, `stockMovements`, `stocktakes.items` phải bị từ chối nếu Product đang deletion-locked.
- Sau khi acquire toàn bộ lock, client phải re-read Product + canonical reference nodes trước khi destructive write.
- Final permanent delete phải là một atomic multi-location update gồm: `products/{productId}=null`, `PRODUCT_DELETED` audit log, và `productDeletionLocks/{productId}=null` cho toàn bộ batch.
- Abort/failure trước final commit phải release lock; browser flow đăng ký `onDisconnect` cleanup trước khi acquire để tránh lock kẹt khi mất kết nối.
- Firebase child key là physical Product identity cho permanent delete; stored `Product.id` mismatch phải fail closed, không được dùng stored id để redirect đường dẫn xóa.

### 3.2. businessDataResetLock — khóa tạm thời cho hard reset dữ liệu kinh doanh

Đường dẫn singleton: `/businessDataResetLock`.

```ts
interface BusinessDataResetLock {
  actorUid: string;
  createdAt: number;
}
```

Đây là **operational concurrency lock tạm thời**, không phải business database thứ hai và không chứa bản sao Product/giao dịch.

Quy tắc contract:
- Chỉ `owner` đang active được tạo lock; `actorUid` phải bằng UID đang đăng nhập.
- Lock là create-only và không được tạo khi còn bất kỳ `/productDeletionLocks` nào; ngược lại không được tạo Product deletion lock mới khi business reset lock đang tồn tại.
- Trong lúc lock tồn tại, Security Rules phải từ chối mọi non-reset write vào `/products`, `/sales`, `/purchases`, `/stockOuts`, `/stockMovements`, `/stockOperations`, `/stocktakes` và `/productDeletionLocks`.
- Sau khi acquire lock, client phải tạo snapshot backup bằng backup system hiện có. Nếu tạo/ghi file backup thất bại, destructive reset không được bắt đầu.
- Destructive phase phải dùng **một root atomic multi-location update** xóa toàn bộ `/products`, `/sales`, `/purchases`, `/stockOuts`, `/stockMovements`, `/stockOperations`, `/stocktakes`, `/productDeletionLocks`; đồng thời tạo audit `BUSINESS_DATA_RESET` và xóa `/businessDataResetLock`.
- Hard reset bắt buộc giữ nguyên `/users`, `/categories`, `/customers`, `/suppliers`, `/expenses`, `/settings` và toàn bộ audit history cũ trong `/auditLogs`.
- Browser flow phải đăng ký `onDisconnect` cleanup trước khi acquire lock; failure trước final commit phải cố giải phóng lock rõ ràng, còn `onDisconnect` là fail-safe khi tab/network chết.
- Backup JSON là snapshot tải xuống phía trình duyệt. Contract restore write hiện tại vẫn độc lập và đang bị khóa an toàn; hard reset không được mô tả là có restore tự động nếu chưa có contract restore được duyệt và kiểm thử.

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

## 5. customers

```ts
interface Customer {
  id: string;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  note?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}
```

Đường dẫn: `/customers/{customerId}`. Khách lẻ có thể để `customerId` trống trên đơn bán.

## 6. suppliers

```ts
interface Supplier {
  id: string;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  taxCode?: string;
  note?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}
```

Đường dẫn: `/suppliers/{supplierId}`.

## 7. sales

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
  customerId?: string;
  customerName?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  costTotal: number;
  profit: number;
  paymentMethod?: 'cash' | 'bank_transfer' | 'other';
  note?: string;
  status: 'completed' | 'cancelled' | 'refunded';
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
```

Snapshot tên/SKU/giá bán/giá vốn tại thời điểm bán là bắt buộc. Hủy/hoàn không xóa giao dịch cũ; phải tạo hoàn kho/stock movement phù hợp.

## 8. purchases — Nhập hàng

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
  supplierId?: string;
  supplierName?: string;
  items: PurchaseItem[];
  total: number;
  note?: string;
  status: 'completed' | 'cancelled';
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
```

Phiếu nhập hoàn tất phải tăng tồn và tạo movement `PURCHASE` trong cùng nghiệp vụ an toàn.

## 9. stockOuts — Xuất hàng không phải bán hàng

Dùng cho xuất sử dụng nội bộ, hỏng/vỡ, biếu tặng hoặc xuất khác không phát sinh doanh thu.

```ts
interface StockOutItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  costPrice: number;
}

interface StockOut {
  id: string;
  code: string;
  reason: 'internal_use' | 'damage' | 'gift' | 'other';
  items: StockOutItem[];
  note?: string;
  status: 'completed' | 'cancelled';
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
```

Đường dẫn: `/stockOuts/{stockOutId}`. Hoàn tất phải giảm tồn và tạo movement `STOCK_OUT`.

## 10. stockMovements — Nhật ký kho bắt buộc

```ts
type StockMovementType =
  | 'OPENING_BALANCE'
  | 'PURCHASE'
  | 'PURCHASE_RETURN'
  | 'SALE'
  | 'SALE_RETURN'
  | 'STOCK_OUT'
  | 'STOCK_OUT_REVERSAL'
  | 'STOCKTAKE_ADJUSTMENT'
  | 'MANUAL_ADJUSTMENT';

interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCost?: number;
  referenceType?: 'opening' | 'sale' | 'purchase' | 'stockout' | 'stocktake' | 'manual';
  referenceId?: string;
  note?: string;
  createdBy: string;
  createdAt: number;
}
```

`quantityDelta` dương tăng kho, âm giảm kho. Không module nào được sửa `stockQuantity` mà không tạo movement tương ứng. Tồn đầu kỳ từ Excel phải đi qua `OPENING_BALANCE`, không ghi thẳng không dấu vết.

## 11. stockOperations — receipt chống chạy nghiệp vụ hai lần

Mỗi nghiệp vụ thay đổi tồn phải có một `operationId` ổn định và duy nhất cho đúng hành động nghiệp vụ. Receipt được tạo **create-only** trong cùng atomic update với chứng từ, tồn kho, movement và audit log.

```ts
interface StockOperationReceipt {
  id: string;
  type: StockMovementType;
  referenceType: 'opening' | 'sale' | 'purchase' | 'stockout' | 'stocktake' | 'manual';
  referenceId: string;
  actorUid: string;
  createdAt: number;
}
```

Ví dụ operation ID:
- `PURCHASE_{purchaseId}`
- `PURCHASE_RETURN_{purchaseId}`
- `SALE_{saleId}`
- `SALE_RETURN_{saleId}`
- `STOCK_OUT_{stockOutId}`
- `STOCK_OUT_REVERSAL_{stockOutId}`
- `STOCKTAKE_ADJUSTMENT_{stocktakeId}`

Nếu sau này hỗ trợ hoàn một phần nhiều lần, mỗi phiếu hoàn phải có `returnId` riêng và operation ID riêng; không dùng lại cùng `SALE_RETURN_{saleId}` cho nhiều lần hoàn hợp lệ.

### Giao thức CAS bắt buộc cho thay đổi tồn

1. Đọc Product và lấy `stockQuantity` + `stockVersion` (thiếu version được hiểu là `0`).
2. Tính `quantityAfter` từ snapshot vừa đọc; nếu âm thì dừng trước khi ghi.
3. Tạo movement với `quantityBefore`/`quantityAfter` đúng snapshot đó.
4. Trong **một** Firebase atomic multi-location update, ghi đồng thời:
   - chứng từ nghiệp vụ;
   - `products/{productId}/stockQuantity = quantityAfter` (giá trị tuyệt đối, không dùng `increment()` cho conditional decrement);
   - `products/{productId}/stockVersion = stockVersion + 1`;
   - `stockMovements`;
   - `stockOperations/{operationId}`;
   - audit log liên quan.
5. Security Rules phải từ chối nếu version ghi lên không đúng `version hiện tại + 1`, hoặc `stockQuantity < 0`, hoặc operation receipt đã tồn tại. Vì multi-location update là atomic, chỉ một client dùng cùng version có thể thắng.
6. Nếu CAS conflict, client đọc lại dữ liệu, dựng lại movement từ snapshot mới và retry hữu hạn. Nếu sau khi đọc lại không đủ tồn thì trả lỗi hết hàng và không ghi phần nào.
7. Nếu operation receipt đã tồn tại, coi nghiệp vụ đó đã commit; không trừ/hoàn tồn lần hai.
8. Với operation nhiều sản phẩm, tất cả product versions phải được cập nhật trong cùng update; conflict ở bất kỳ sản phẩm nào phải làm toàn bộ operation thất bại để retry.

## 12. stocktakes — Kiểm kê

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
  note?: string;
  createdBy: string;
  createdAt: number;
  completedAt?: number;
}
```

Chỉ khi hoàn tất kiểm kê mới tạo movement `STOCKTAKE_ADJUSTMENT`.

## 13. expenses — Chi phí

```ts
interface Expense {
  id: string;
  code: string;
  category: string;
  amount: number;
  expenseDate: number;
  note?: string;
  status: 'completed' | 'cancelled';
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
```

Đường dẫn: `/expenses/{expenseId}`. Chi phí được dùng trong báo cáo lợi nhuận ròng nhưng không tác động tồn kho.

## 14. Doanh thu, giá vốn, lợi nhuận

Nguồn chuẩn:
- **Doanh thu**: tổng `Sale.total` của đơn `completed`, trừ các nghiệp vụ hoàn theo quy ước báo cáo.
- **Giá vốn**: snapshot `Sale.costTotal`/`SaleItem.costPrice`, không dùng giá vốn hiện tại của Product để tính lại quá khứ.
- **Lợi nhuận gộp**: doanh thu thuần - giá vốn.
- **Lợi nhuận ròng**: lợi nhuận gộp - chi phí hợp lệ.

Báo cáo phải hỗ trợ ngày/tuần/tháng/quý/năm và khoảng ngày tùy chọn.

## 15. QR, mã vạch và in tem

- QR của sản phẩm dùng giá trị ổn định (`qrCode` hoặc SKU/ID theo quy ước module), không nhúng giá bán/tồn kho dễ thay đổi.
- Barcode mặc định ưu tiên **CODE128** vì hỗ trợ SKU linh hoạt; EAN-13 chỉ dùng khi mã hợp lệ.
- Camera quét trên trình duyệt điện thoại yêu cầu HTTPS khi chạy trên domain thật.
- Mẫu tem chuẩn phải hỗ trợ ít nhất:
  - 2 nhãn/hàng: 74 × 22 mm.
  - 2 nhãn/hàng: 72 × 22 mm.
  - 1 nhãn/hàng: 50 × 30 mm.
- Cho phép cấu hình kích thước tùy chỉnh theo mm để không khóa vào một loại máy/giấy.
- In dùng HTML/CSS print, không phụ thuộc Firebase Hosting.

## 16. settings

```ts
interface LabelTemplateSettings {
  id: string;
  name: string;
  columns: 1 | 2;
  labelWidthMm: number;
  labelHeightMm: number;
  gapMm?: number;
  pageMarginMm?: number;
}

interface StoreSettings {
  storeName: string;
  address?: string;
  phone?: string;
  currency: 'VND';
  defaultLabelTemplateId?: string;
  labelTemplates?: Record<string, LabelTemplateSettings>;
  updatedAt: number;
}
```

## 17. auditLogs

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

Các hành động quan trọng như chỉnh tồn, hủy đơn, đổi quyền, restore backup phải có audit log.

## 18. Sao lưu và khôi phục

Phiên bản đầu dùng backup phía trình duyệt:
- Owner có thể tải xuống file JSON chứa dữ liệu nghiệp vụ + `schemaVersion` + `exportedAt`.
- Có thể xuất thêm Excel phục vụ đọc thủ công, nhưng JSON là định dạng khôi phục chuẩn.
- Restore phải có bước đọc/validate/preview trước khi ghi.
- Không tự ghi đè database đang dùng nếu chưa có xác nhận rõ ràng.
- Restore chỉ dành cho owner và phải tạo audit log.
- Backup phải bao gồm `stockVersion` và `stockOperations` để không làm mất hàng rào concurrency/idempotency khi khôi phục.
- Backup file không được tự commit vào GitHub.

## 19. Nguyên tắc ghi dữ liệu

- Mọi thay đổi tồn phải tuân thủ giao thức CAS + operation receipt ở mục 11.
- Firebase atomic multi-location update vẫn là đơn vị commit của nghiệp vụ nhiều đường dẫn; preflight phía client chỉ phục vụ UX, không phải hàng rào concurrency.
- Không để trạng thái đơn hoàn tất nhưng stock update thất bại một nửa.
- Không cho client tự gán `owner`.
- Ưu tiên trạng thái/hủy thay vì xóa dữ liệu nghiệp vụ.
- Báo cáo lịch sử đọc snapshot giao dịch, không lấy giá hiện tại để tính lại quá khứ.

## 20. Chỉ mục dự kiến

Chỉ thêm khi query thực tế dùng đến:
- `createdAt`
- `expenseDate`
- `sku`
- `barcode`
- `qrCode`
- `status`
- `productId`
- `referenceId`
- `customerId`
- `supplierId`

## 21. Phiên bản schema

Khi triển khai Backup/Restore, dùng `schemaVersion` bắt đầu từ `1`. Mọi thay đổi phá tương thích phải có migration hoặc từ chối restore với thông báo rõ ràng.
