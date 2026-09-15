# MODULE COORDINATION — Kế hoạch chia nhiều chat không xung đột

Mục tiêu: nhiều AI/chat có thể làm song song nhưng GitHub vẫn là nguồn sự thật duy nhất.

## Nguyên tắc chung

Mỗi chat trước khi code phải đọc:
- `PROJECT_RULES.md`
- `ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `AI_TASKS.md`
- `MODULE_COORDINATION.md`
- `AGENTS.md`

Không chat nào được tự sửa `DATABASE_SCHEMA.md`, `PROJECT_RULES.md`, `database.rules.json`, `src/types/models.ts` hoặc kiến trúc router tổng nếu nhiệm vụ không cho phép. Nếu cần thay đổi, ghi đề xuất trong PR để AI trung tâm xử lý.

Mỗi chat làm trên branch riêng và mở PR về `main`. Không merge trực tiếp nếu CI chưa xanh.

## Pre-code bắt buộc cho mọi chat

Trước implementation, mỗi chat phải thực hiện theo thứ tự:

`SEARCH → READ → TRACE → REUSE → EXTEND → CREATE`

Và báo ngắn cho AI trung tâm:

A. Đã đọc những file nào.

B. Đã search code tương tự ở đâu.

C. Sẽ reuse helper/service/component/type/pattern nào.

D. Dự kiến sửa những file nào.

E. Sẽ KHÔNG sửa những file/shared contract nào.

F. Root cause hoặc implementation point nhỏ nhất đã xác định là gì.

G. Có cần đổi schema, Security Rules, shared contract, dependency hoặc module ownership không.

Nếu câu G là **có**, chat phải DỪNG và chờ AI trung tâm duyệt trước khi code.

Không tạo helper/component/service mới chỉ vì thuận tiện nếu chức năng tương đương đã tồn tại. Không tạo implementation thứ hai cho cùng trách nhiệm nghiệp vụ.

## Đoạn bắt buộc trong prompt AI phụ

Mọi prompt implementation do AI trung tâm giao phải chứa hoặc dẫn chiếu rõ các yêu cầu tương đương sau:

> Trước khi viết code mới:
> 1. Search toàn bộ vùng code liên quan.
> 2. Tìm implementation/helper/service/component đã tồn tại.
> 3. Trace luồng dữ liệu end-to-end.
> 4. Reuse hoặc extend implementation hiện có nếu phù hợp.
> 5. Không tạo hệ thống song song.
> 6. Không thêm abstraction/dependency/file nếu không thực sự cần.
> 7. Sửa root cause, không vá symptom.
> 8. Giữ diff nhỏ nhất có thể nhưng correctness/security/data integrity ưu tiên cao hơn số dòng code.
> 9. Nếu cần đổi schema, Security Rules, shared contract hoặc module ownership: DỪNG và báo AI trung tâm.

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
- Reuse stock/CAS service hiện có; cấm tạo stock updater song song.

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
- Không duplicate Customer/Supplier model hoặc search helper nếu shared implementation đã có.

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
- Reuse Product lookup/search/handoff contract; không tạo product search/database song song.

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
- Reuse inventory stock operation/CAS; không viết cơ chế trừ tồn riêng.

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
- Không tạo nguồn doanh thu/COGS/profit thứ hai nếu report service hiện có đã là nguồn chuẩn.

## Trách nhiệm AI trung tâm

AI trung tâm:
- giữ schema/shared types/security rules;
- review PR;
- phát hiện xung đột;
- quyết định thứ tự merge;
- cập nhật task board;
- không để hai chat cùng sửa cùng một service nghiệp vụ cốt lõi;
- xác định owner nếu cần shared implementation;
- kiểm tra reuse/duplication/root-cause/scope trước khi merge.

Trước khi merge, AI trung tâm phải kiểm tra tối thiểu:

1. Scope đúng task.
2. Không viết lại thứ đã tồn tại.
3. Không tạo hệ thống song song.
4. Không thêm dependency/abstraction/file không cần thiết.
5. Không phá shared contract/schema/Rules.
6. Không sửa stock trực tiếp hoặc phá CAS/idempotency.
7. Không tạo race/data-loss/security/permission regression không được xử lý.
8. Responsive/accessibility phù hợp scope.
9. Logic quan trọng có test/regression test.
10. Diff đã nhỏ hợp lý nhưng không đánh đổi correctness.

## Báo cáo sau implementation

Mỗi chat phải trả về:

- branch;
- base SHA;
- head SHA;
- files changed;
- code/pattern đã reuse;
- code mới thực sự cần tạo;
- tests/build/CI;
- contract đã kiểm tra;
- known limitations;
- schema/security/dependency có thay đổi hay không;
- conflict/impact module khác;
- PR number.

Không chấp nhận báo cáo chỉ có “đã hoàn thành”.

## Thứ tự merge khuyến nghị

1. Inventory core (`INV-001/002/003`).
2. CRM/Expenses và QR/Printing có thể merge độc lập khi CI xanh.
3. Purchase/StockOut/Stocktake sau Inventory core.
4. Sales/POS sau Inventory core + Customer tối thiểu.
5. Reports/Backup/QA sau các transaction module chính.
