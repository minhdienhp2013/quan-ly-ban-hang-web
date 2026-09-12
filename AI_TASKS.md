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
| AUTH-002 | Owner/staff + rules | REVIEW | Còn smoke test owner/staff trên app chạy thật |

## Giai đoạn 1 — Sản phẩm

| ID | Công việc | Trạng thái | Ghi chú |
|---|---|---|---|
| PROD-001 | Danh sách sản phẩm realtime | DONE | PR #3 |
| PROD-002 | Thêm/sửa/ngừng sử dụng | DONE | PR #3 |
| PROD-003 | Tìm SKU/barcode/QR | DONE | PR #3 |
| PROD-004 | Import Excel sản phẩm | DONE | PR #4 |
| PROD-005 | Danh mục sản phẩm | TODO | Có thể bổ sung sau vòng QA nếu cần |

## Giai đoạn 2 — Kho, nhập, xuất, kiểm kê

| ID | Công việc | Trạng thái | Ghi chú |
|---|---|---|---|
| INV-001 | Màn hình tồn kho | DONE | PR #5 |
| INV-002 | Stock movement service + concurrency | DONE | PR #5; CAS `stockVersion` + `stockOperations` |
| INV-003 | Tồn đầu kỳ/OPENING_BALANCE từ Excel | DONE | PR #5 |
| PUR-001 | Phiếu nhập hàng | DONE | PR #5 |
| PUR-002 | Hủy/hoàn phiếu nhập an toàn | DONE | PR #5 |
| OUT-001 | Phiếu xuất hàng không doanh thu | DONE | PR #5 |
| OUT-002 | Hủy phiếu xuất/hoàn tồn | DONE | PR #5 |
| STK-001 | Kiểm kê draft | DONE | PR #5 |
| STK-002 | Chốt kiểm kê + điều chỉnh kho | DONE | PR #5 |

## Giai đoạn 3 — CRM và chi phí

| ID | Công việc | Trạng thái | Ghi chú |
|---|---|---|---|
| CUST-001 | Danh sách/thêm/sửa khách hàng | DONE | PR #6 |
| CUST-002 | Tìm kiếm khách hàng | DONE | PR #6 |
| SUP-001 | Danh sách/thêm/sửa nhà cung cấp | DONE | PR #6 |
| SUP-002 | Tìm kiếm nhà cung cấp | DONE | PR #6 |
| EXP-001 | Danh mục và ghi nhận chi phí | DONE | PR #6 |
| EXP-002 | Hủy/sửa chi phí có audit | DONE | PR #6 |

## Giai đoạn 4 — Bán hàng/POS

| ID | Công việc | Trạng thái | Ghi chú |
|---|---|---|---|
| SALE-001 | POS/giỏ hàng responsive | DONE | PR #9 |
| SALE-002 | Tạo đơn + trừ tồn an toàn | DONE | PR #9, dùng INV-002 CAS/idempotency |
| SALE-003 | Chọn khách hàng/khách lẻ | DONE | PR #9 + PR #6 |
| SALE-004 | Thanh toán tiền mặt/chuyển khoản/khác | DONE | PR #9 |
| SALE-005 | Lịch sử đơn hàng | DONE | PR #9 |
| SALE-006 | Hủy/hoàn đơn + hoàn kho | DONE | PR #9 |

## Giai đoạn 5 — QR, Barcode, In tem

| ID | Công việc | Trạng thái | Ghi chú |
|---|---|---|---|
| QR-001 | Quét QR bằng camera điện thoại | DONE | PR #7; smoke test thiết bị thật chuyển sang QA |
| QR-002 | Quét liên tục + chống quét trùng | DONE | PR #7 |
| QR-003 | Tạo QR sản phẩm | DONE | PR #7 |
| BAR-001 | Tạo barcode CODE128/EAN13 khi hợp lệ | DONE | PR #7 |
| PRINT-001 | Tem 2 nhãn 74×22 mm | DONE | PR #7 |
| PRINT-002 | Tem 2 nhãn 72×22 mm | DONE | PR #7 |
| PRINT-003 | Tem 1 nhãn 50×30 mm | DONE | PR #7 |
| PRINT-004 | Mẫu tem tùy chỉnh mm + print preview | DONE | PR #7 |
| PRINT-005 | In tên/SP/SKU/barcode/QR/giá tùy chọn | DONE | PR #7 |

## Giai đoạn 6 — Doanh thu, giá vốn, lợi nhuận, báo cáo

| ID | Công việc | Trạng thái | Ghi chú |
|---|---|---|---|
| REP-001 | Doanh thu ngày/tuần/tháng/quý/năm | DONE | PR #10 |
| REP-002 | Giá vốn theo snapshot đơn bán | DONE | PR #10; không dùng Product.costPrice lịch sử |
| REP-003 | Lợi nhuận gộp | DONE | PR #10 |
| REP-004 | Chi phí và lợi nhuận ròng | DONE | PR #10 |
| REP-005 | Báo cáo tồn kho | DONE | PR #10 |
| REP-006 | Báo cáo nhập/xuất | DONE | PR #10 |
| REP-007 | Báo cáo khách hàng/nhà cung cấp cơ bản | DONE | PR #10 |
| REP-008 | Xuất báo cáo Excel | DONE | PR #10 |

## Giai đoạn 7 — Sao lưu, bảo mật, chất lượng

| ID | Công việc | Trạng thái | Ghi chú |
|---|---|---|---|
| BACK-001 | Xuất backup JSON có schemaVersion | DONE | PR #10; gồm stockOperations/stockVersion |
| BACK-002 | Restore preview/validate/confirm | BLOCKED | PR #10 có preview/validate fail-closed; write cần contract restore đặc quyền được AI trung tâm duyệt |
| BACK-003 | Export Excel dữ liệu chính | DONE | PR #10 |
| SEC-001 | Hoàn thiện Firebase Rules cho node mới | REVIEW | CAS/idempotency đã có; cần chốt ma trận quyền owner/staff và restore policy trước release |
| QA-001 | Responsive điện thoại/tablet/PC | REVIEW | Static/test tự động pass; cần smoke test thiết bị thật |
| QA-002 | Touch target + camera permission + rotate screen | REVIEW | Cần Android/iOS thật qua HTTPS |
| QA-003 | Test luồng kho xuyên module | REVIEW | Cần Firebase thật với dữ liệu test |
| QA-004 | Test sai mạng/mất mạng/lỗi Firebase | REVIEW | Cần môi trường runtime thật |
| QA-005 | Regression trước release | REVIEW | PR #10 test 13/13 + build xanh; còn smoke test release |

## Quyết định restore hiện tại

- Không nới Rules giao dịch bình thường chỉ để restore.
- Restore write trong browser đang bị khóa fail-closed để bảo toàn `stockVersion` và `stockOperations`.
- AI trung tâm sẽ thiết kế một contract restore owner-only riêng nếu tiếp tục yêu cầu browser-only; hoặc tách restore đặc quyền sang môi trường Admin đáng tin cậy.
- Không đánh dấu BACK-002 DONE cho tới khi restore thật được kiểm thử an toàn.

## Tiêu chuẩn responsive bắt buộc

Mọi module phải chạy tốt ở điện thoại khoảng 320 px+, tablet và PC; không cuộn ngang toàn trang; touch target chính khoảng 44 px; camera chạy qua HTTPS; in tem dùng CSS print riêng; loading/error/empty state rõ ràng.

## Quy tắc nhận việc cho AI module

Mỗi chat/module phải nhận task ID, branch riêng, phạm vi file, schema/interface phải tuân thủ và file cấm sửa. AI module không tự sửa kiến trúc/schema/rules/shared types nếu chưa được AI trung tâm cho phép.

## Quyết định triển khai frontend

- Không dùng Firebase Hosting.
- Build thành `dist/` và người dùng đưa lên hosting/domain riêng.
- Firebase dùng Authentication + Realtime Database.
- Camera trên website thật phải chạy HTTPS.

## Thứ tự ưu tiên hiện tại

1. Các module chính: DONE.
2. Reports/backup export: DONE qua PR #10.
3. Hoàn thiện trước release: publish Rules mới nhất, smoke test Firebase/device thật, chốt quyền owner/staff, quyết định cơ chế BACK-002 restore write.

AI trung tâm giữ quyền review/merge và giải quyết xung đột giữa các PR.
