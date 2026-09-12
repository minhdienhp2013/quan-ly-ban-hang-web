# AI TASKS — Bảng điều phối công việc

Tài liệu này dùng để AI trung tâm phân việc cho các AI/đoạn chat khác. Mỗi AI phải kiểm tra trạng thái trước khi bắt đầu.

## Quy ước trạng thái

- `TODO`: chưa bắt đầu.
- `IN_PROGRESS`: đang thực hiện.
- `REVIEW`: chờ AI trung tâm kiểm tra hoặc bước triển khai cuối.
- `BLOCKED`: bị chặn bởi quyết định/phụ thuộc khác.
- `DONE`: đã hoàn thành và được chấp nhận.

## Giai đoạn 0 — Nền móng

| ID | Công việc | Trạng thái | Ghi chú |
|---|---|---|---|
| CORE-001 | Quy tắc dự án | DONE | `PROJECT_RULES.md` |
| CORE-002 | Kiến trúc ban đầu | DONE | `ARCHITECTURE.md` |
| CORE-003 | Schema Firebase | DONE | `DATABASE_SCHEMA.md` |
| CORE-004 | React + TypeScript + Vite | DONE | PR #1 |
| CORE-005 | Firebase Web/Auth/RTDB | DONE | URL database xác nhận |
| CORE-006 | Routing/layout responsive | DONE | PR #2 |
| CORE-007 | Shared types | DONE | PR #2 |
| AUTH-001 | Email/Password Auth | DONE | PR #2 |
| AUTH-002 | Owner/staff + rules | REVIEW | Rules đã Publish; còn smoke test owner trên app chạy thật/local |

## Giai đoạn 1 — Sản phẩm

| ID | Công việc | Trạng thái | Ghi chú |
|---|---|---|---|
| PROD-001 | Danh sách sản phẩm realtime | DONE | PR #3 |
| PROD-002 | Thêm/sửa/ngừng sử dụng | DONE | PR #3 |
| PROD-003 | Tìm SKU/barcode/QR | DONE | PR #3 |
| PROD-004 | Import Excel sản phẩm | DONE | PR #4, preview/trùng/lỗi |
| PROD-005 | Danh mục sản phẩm | TODO | Có thể làm sau inventory core |

## Giai đoạn 2 — Kho, nhập, xuất, kiểm kê

| ID | Công việc | Trạng thái | Phụ thuộc |
|---|---|---|---|
| INV-001 | Màn hình tồn kho | TODO | Products |
| INV-002 | Stock movement service + transaction | TODO | Schema |
| INV-003 | Tồn đầu kỳ/OPENING_BALANCE từ Excel | TODO | INV-002 |
| PUR-001 | Phiếu nhập hàng | TODO | INV-002, Suppliers |
| PUR-002 | Hủy/hoàn phiếu nhập an toàn | TODO | PUR-001 |
| OUT-001 | Phiếu xuất hàng không doanh thu | TODO | INV-002 |
| OUT-002 | Hủy phiếu xuất/hoàn tồn | TODO | OUT-001 |
| STK-001 | Kiểm kê draft | TODO | INV-001 |
| STK-002 | Chốt kiểm kê + điều chỉnh kho | TODO | INV-002, STK-001 |

## Giai đoạn 3 — CRM và chi phí

| ID | Công việc | Trạng thái |
|---|---|---|
| CUST-001 | Danh sách/thêm/sửa khách hàng | TODO |
| CUST-002 | Tìm kiếm khách hàng | TODO |
| SUP-001 | Danh sách/thêm/sửa nhà cung cấp | TODO |
| SUP-002 | Tìm kiếm nhà cung cấp | TODO |
| EXP-001 | Danh mục và ghi nhận chi phí | TODO |
| EXP-002 | Hủy/sửa chi phí có audit | TODO |

## Giai đoạn 4 — Bán hàng/POS

| ID | Công việc | Trạng thái | Phụ thuộc |
|---|---|---|---|
| SALE-001 | POS/giỏ hàng responsive | TODO | Products, INV-002 |
| SALE-002 | Tạo đơn + trừ tồn an toàn | TODO | INV-002 |
| SALE-003 | Chọn khách hàng/khách lẻ | TODO | CUST-001 |
| SALE-004 | Thanh toán tiền mặt/chuyển khoản/khác | TODO | SALE-001 |
| SALE-005 | Lịch sử đơn hàng | TODO | SALE-002 |
| SALE-006 | Hủy/hoàn đơn + hoàn kho | TODO | SALE-002, INV-002 |

## Giai đoạn 5 — QR, Barcode, In tem

| ID | Công việc | Trạng thái |
|---|---|---|
| QR-001 | Quét QR bằng camera điện thoại | TODO |
| QR-002 | Quét liên tục + chống quét trùng | TODO |
| QR-003 | Tạo QR sản phẩm | TODO |
| BAR-001 | Tạo barcode CODE128/EAN13 khi hợp lệ | TODO |
| PRINT-001 | Tem 2 nhãn 74×22 mm | TODO |
| PRINT-002 | Tem 2 nhãn 72×22 mm | TODO |
| PRINT-003 | Tem 1 nhãn 50×30 mm | TODO |
| PRINT-004 | Mẫu tem tùy chỉnh mm + print preview | TODO |
| PRINT-005 | In tên/SP/SKU/barcode/QR/giá tùy chọn | TODO |

## Giai đoạn 6 — Doanh thu, giá vốn, lợi nhuận, báo cáo

| ID | Công việc | Trạng thái | Phụ thuộc |
|---|---|---|---|
| REP-001 | Doanh thu ngày/tuần/tháng/quý/năm | TODO | Sales |
| REP-002 | Giá vốn theo snapshot đơn bán | TODO | Sales |
| REP-003 | Lợi nhuận gộp | TODO | REP-001/002 |
| REP-004 | Chi phí và lợi nhuận ròng | TODO | Expenses |
| REP-005 | Báo cáo tồn kho | TODO | Inventory |
| REP-006 | Báo cáo nhập/xuất | TODO | Purchases/StockOuts |
| REP-007 | Báo cáo khách hàng/nhà cung cấp cơ bản | TODO | CRM |
| REP-008 | Xuất báo cáo Excel | TODO | Reports |

## Giai đoạn 7 — Sao lưu, bảo mật, chất lượng

| ID | Công việc | Trạng thái |
|---|---|---|
| BACK-001 | Xuất backup JSON có schemaVersion | TODO |
| BACK-002 | Restore preview/validate/confirm | TODO |
| BACK-003 | Export Excel dữ liệu chính | TODO |
| SEC-001 | Hoàn thiện Firebase Rules cho node mới | TODO |
| QA-001 | Responsive điện thoại/tablet/PC | TODO |
| QA-002 | Touch target + camera permission + rotate screen | TODO |
| QA-003 | Test luồng kho xuyên module | TODO |
| QA-004 | Test sai mạng/mất mạng/lỗi Firebase | TODO |
| QA-005 | Regression trước release | TODO |

## Tiêu chuẩn responsive bắt buộc

Mọi module phải:
- Chạy tốt ở điện thoại từ khoảng 320 px chiều rộng, tablet và PC.
- Không bắt người dùng cuộn ngang cả trang; bảng lớn phải có card/mobile layout hoặc vùng cuộn cục bộ hợp lý.
- Nút thao tác chính đủ lớn cho cảm ứng (mục tiêu tối thiểu khoảng 44 px chiều cao/vùng chạm).
- Form dùng được với bàn phím điện thoại, input number/tel/search phù hợp.
- Camera scanner hoạt động qua HTTPS trên domain thật, có fallback/chỉ dẫn quyền camera.
- In tem có CSS `@media print` riêng, không phụ thuộc kích thước màn hình.
- Loading/error/empty state rõ ràng.

## Quy tắc nhận việc cho AI module

Mỗi chat/module phải nhận:
1. Task ID.
2. Branch riêng.
3. Phạm vi file được phép sửa.
4. Schema/interface phải tuân thủ.
5. File cấm sửa nếu không được AI trung tâm cho phép.

AI module không tự sửa `DATABASE_SCHEMA.md`, `PROJECT_RULES.md`, Firebase rules, shared types hoặc router tổng nếu nhiệm vụ không cho phép.

## Quyết định triển khai frontend

- Không dùng Firebase Hosting.
- Build thành `dist/` và sau này người dùng tự đưa lên hosting/domain riêng.
- Firebase dùng Authentication + Realtime Database.
- Mọi camera feature trên website thật phải chạy HTTPS.

## Thứ tự ưu tiên

### Có thể làm song song ngay
1. Chat Kho: `INV-001/002/003`, sau đó `PUR`, `OUT`, `STK`.
2. Chat CRM: `CUST`, `SUP`, `EXP`.
3. Chat QR/In tem: `QR`, `BAR`, `PRINT`.

### Chỉ bắt đầu sau khi Inventory core merge
4. Chat Bán hàng: `SALE-*`.

### Sau khi giao dịch chính ổn định
5. Chat Báo cáo/Backup/QA: `REP`, `BACK`, `SEC`, `QA`.

AI trung tâm giữ quyền review/merge và giải quyết xung đột giữa các PR.
