# ARCHITECTURE — Kiến trúc hệ thống ban đầu

## 1. Mục tiêu

Xây dựng phần mềm quản lý bán hàng/kho chạy hoàn toàn trên trình duyệt, dễ dùng cho cửa hàng/xưởng nhỏ, dùng được trên máy tính và điện thoại, ưu tiên đơn giản nhưng có khả năng mở rộng.

## 2. Stack chuẩn

- React + TypeScript + Vite.
- React Router cho điều hướng.
- Firebase Authentication.
- Firebase Realtime Database.
- Firebase Hosting hoặc hosting tĩnh tương thích SPA.
- Thư viện đọc/ghi Excel chỉ dùng ở lớp import/export.
- Quét QR dùng Web Camera API/thư viện QR tương thích trình duyệt.
- In tem thông qua giao diện in của trình duyệt với CSS theo khổ tem; không phụ thuộc phần mềm desktop nếu không bắt buộc.

## 3. Ranh giới module

Dự kiến cấu trúc `src/modules/`:

- `auth`: đăng nhập, phiên người dùng, phân quyền.
- `products`: danh mục sản phẩm, SKU, mã QR, giá nhập/giá bán.
- `sales`: giỏ hàng, đơn bán, thanh toán, hoàn/trả nếu có.
- `purchases`: phiếu nhập hàng.
- `inventory`: tồn kho hiện tại và lịch sử biến động.
- `stocktake`: kiểm kê và chênh lệch.
- `excel`: nhập/xuất dữ liệu Excel.
- `qr`: quét liên tục, tra sản phẩm, tạo mã.
- `printing`: mẫu tem và luồng in.
- `reports`: doanh thu, giá vốn, lợi nhuận, tồn kho.
- `users`: tài khoản, vai trò và quyền.
- `settings`: cấu hình cửa hàng và hệ thống.

## 4. Các lớp dùng chung

Dự kiến:

```text
src/
  app/          # bootstrap, routes, providers
  components/   # UI dùng chung
  firebase/     # firebase initialization + data access primitives
  modules/      # nghiệp vụ theo module
  services/     # dịch vụ dùng chung giữa nhiều module
  types/        # kiểu dữ liệu dùng chung
  utils/        # hàm tiện ích thuần
```

Nguyên tắc: component UI không trực tiếp thao tác nhiều nhánh database nếu logic đó có thể nằm trong service.

## 5. Luồng dữ liệu chính

### Bán hàng

1. Người dùng quét QR/tìm sản phẩm.
2. Thêm sản phẩm vào giỏ.
3. Xác nhận đơn.
4. Ghi `sales`.
5. Tạo một hoặc nhiều `stockMovements` kiểu `SALE`.
6. Cập nhật số lượng tồn theo transaction/multi-location update phù hợp.
7. Báo cáo đọc dữ liệu bán hàng và tồn kho từ nguồn chuẩn.

### Nhập hàng

1. Tạo phiếu nhập.
2. Ghi `purchases`.
3. Tạo stock movement kiểu `PURCHASE`.
4. Tăng tồn.

### Kiểm kê

1. Chụp snapshot số lượng hệ thống.
2. Người dùng nhập/quét số lượng thực tế.
3. Tính chênh lệch.
4. Sau khi duyệt, tạo stock movement kiểu `STOCKTAKE_ADJUSTMENT`.

## 6. Nguyên tắc tồn kho

`products/{productId}/stockQuantity` có thể được duy trì như giá trị tổng hợp để đọc nhanh, nhưng lịch sử thật sự phải có `stockMovements`. Không được thay đổi tồn mà không tạo dấu vết tương ứng.

## 7. Phân quyền ban đầu

Vai trò tối thiểu:

- `owner`: toàn quyền nghiệp vụ, người dùng, cấu hình, báo cáo, giá vốn.
- `staff`: bán hàng và các quyền nghiệp vụ được chủ cửa hàng cho phép.

Không chỉ ẩn nút ở giao diện. Firebase Security Rules phải kiểm tra quyền ở tầng dữ liệu.

## 8. Offline và đồng bộ

Phiên bản đầu ưu tiên online ổn định. Có thể bật cơ chế cache/persistence phù hợp sau khi luồng chính hoạt động đúng. Không thiết kế offline-first ngay từ đầu để tránh tăng độ phức tạp không cần thiết.

## 9. Quyết định cần giữ ổn định ở giai đoạn đầu

- Một repository frontend chính.
- Một schema Firebase thống nhất.
- Một bộ type dùng chung.
- Mỗi nghiệp vụ tồn kho có transaction log.
- Không tách microservice khi chưa có nhu cầu thực tế.

## 10. Thứ tự xây dựng

1. Nền móng project + Firebase + auth.
2. Products.
3. Inventory/stock movements.
4. Sales.
5. Purchases.
6. Excel import/export.
7. QR scanning + label printing.
8. Stocktake.
9. Reports.
10. Users/permissions hardening, audit và hoàn thiện UX.
