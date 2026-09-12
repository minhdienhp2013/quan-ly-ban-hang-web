# MODULE COORDINATION — Kế hoạch chia nhiều chat không xung đột

Mục tiêu: nhiều AI/chat có thể làm song song nhưng GitHub vẫn là nguồn sự thật duy nhất.

## Nguyên tắc chung

Mỗi chat trước khi code phải đọc:
- `PROJECT_RULES.md`
- `ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `AI_TASKS.md`
- `MODULE_COORDINATION.md`

Không chat nào được tự sửa `DATABASE_SCHEMA.md`, `PROJECT_RULES.md`, `database.rules.json`, `src/types/models.ts` hoặc kiến trúc router tổng nếu nhiệm vụ không cho phép. Nếu cần thay đổi, ghi đề xuất trong PR để AI trung tâm xử lý.

Mỗi chat làm trên branch riêng và mở PR về `main`. Không merge trực tiếp nếu CI chưa xanh.

## Chat A — Kho / Nhập hàng / Xuất hàng / Kiểm kê

Branch: `feature/inventory-purchase-stockout`

Task:
- INV-001, INV-002, INV-003
- PUR-001, PUR-002
- OUT-001, OUT-002
- STK-001, STK-002

Được sửa chủ yếu:
- `src/modules/inventory/**`
- `src/modules/purchases/**`
- `src/modules/stockout/**`
- `src/modules/stocktake/**`
- CSS riêng các module

Yêu cầu:
- Mọi thay đổi tồn tạo `stockMovements`.
- Dùng transaction/multi-location update an toàn.
- Không âm thầm cho tồn âm nếu chưa có quyết định riêng.
- Tồn đầu kỳ từ Excel phải tạo `OPENING_BALANCE`.
- Responsive mobile/tablet/PC.

## Chat B — Khách hàng / Nhà cung cấp / Chi phí

Branch: `feature/crm-expenses`

Task:
- CUST-001, CUST-002
- SUP-001, SUP-002
- EXP-001, EXP-002

Được sửa chủ yếu:
- `src/modules/customers/**`
- `src/modules/suppliers/**`
- `src/modules/expenses/**`
- CSS riêng

Yêu cầu:
- CRUD theo soft-disable/status khi phù hợp.
- Search nhanh theo tên/mã/điện thoại.
- Chi phí dùng số nguyên VND và chỉ owner truy cập theo Rules hiện tại.
- Responsive mobile/tablet/PC.

## Chat C — QR / Barcode / In tem

Branch: `feature/qr-barcode-printing`

Task:
- QR-001, QR-002, QR-003
- BAR-001
- PRINT-001 đến PRINT-005

Được sửa chủ yếu:
- `src/modules/qr/**`
- `src/modules/printing/**`
- các component scanner/label dùng riêng module

Yêu cầu:
- Camera điện thoại trên browser HTTPS.
- Quét liên tục có debounce/chống quét trùng.
- CODE128 mặc định; EAN-13 khi mã hợp lệ.
- Preset tem: 74×22 mm 2 cột, 72×22 mm 2 cột, 50×30 mm 1 cột.
- Có custom size theo mm.
- Print CSS độc lập màn hình.
- Không yêu cầu phần mềm desktop để thao tác cơ bản.

## Chat D — Bán hàng/POS

Chỉ bắt đầu sau khi PR Inventory core (`INV-002`) đã merge.

Branch: `feature/sales-pos`

Task:
- SALE-001 đến SALE-006

Được sửa chủ yếu:
- `src/modules/sales/**`

Yêu cầu:
- POS tối ưu cảm ứng điện thoại/tablet và bàn phím PC.
- Tìm/quét sản phẩm nhanh.
- Tạo đơn + trừ tồn phải nguyên tử/an toàn.
- Hủy/hoàn đơn tạo movement hoàn kho, không xóa lịch sử.
- Hỗ trợ khách lẻ và chọn Customer.

## Chat E — Báo cáo / Backup / QA

Chỉ bắt đầu mạnh sau khi các giao dịch chính ổn định.

Branch: `feature/reports-backup-qa`

Task:
- REP-001 đến REP-008
- BACK-001 đến BACK-003
- QA-001 đến QA-005

Yêu cầu:
- Doanh thu/giá vốn/lợi nhuận dùng snapshot giao dịch.
- Lợi nhuận ròng = lợi nhuận gộp - chi phí.
- Backup JSON có `schemaVersion` và preview trước restore.
- Không commit backup dữ liệu thật vào GitHub.
- Regression test mobile/tablet/PC.

## Trách nhiệm AI trung tâm

AI trung tâm:
- giữ schema/shared types/security rules;
- review PR;
- phát hiện xung đột;
- quyết định thứ tự merge;
- cập nhật task board;
- không để hai chat cùng sửa cùng một service nghiệp vụ cốt lõi.

## Thứ tự merge khuyến nghị

1. Inventory core (`INV-001/002/003`).
2. CRM/Expenses và QR/Printing có thể merge độc lập khi CI xanh.
3. Purchase/StockOut/Stocktake sau Inventory core.
4. Sales/POS sau Inventory core + Customer tối thiểu.
5. Reports/Backup/QA sau các transaction module chính.
