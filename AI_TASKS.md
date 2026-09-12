# AI TASKS — Bảng điều phối công việc

Tài liệu này dùng để AI trung tâm phân việc cho các AI/đoạn chat khác. Mỗi AI phải kiểm tra trạng thái trước khi bắt đầu.

## Quy ước trạng thái

- `TODO`: chưa bắt đầu.
- `IN_PROGRESS`: đang thực hiện.
- `REVIEW`: chờ AI trung tâm kiểm tra hoặc bước triển khai cuối.
- `BLOCKED`: bị chặn bởi quyết định/phụ thuộc khác.
- `DONE`: đã hoàn thành và được chấp nhận.

## Giai đoạn 0 — Nền móng

| ID | Công việc | Phạm vi | Trạng thái | Ghi chú |
|---|---|---|---|---|
| CORE-001 | Xác lập quy tắc dự án | Docs | DONE | `PROJECT_RULES.md` |
| CORE-002 | Xác lập kiến trúc ban đầu | Docs | DONE | `ARCHITECTURE.md` |
| CORE-003 | Xác lập schema Firebase ban đầu | Docs | DONE | `DATABASE_SCHEMA.md` |
| CORE-004 | Tạo bộ khung React + TypeScript + Vite | Core | DONE | PR #1, CI build thành công |
| CORE-005 | Cấu hình Firebase Web qua env | Core | DONE | Firebase App/Auth + Realtime Database URL đã xác nhận |
| CORE-006 | Tạo routing/layout chung | Core/UI | DONE | PR #2, responsive desktop + mobile, CI xanh |
| CORE-007 | Thiết lập types dùng chung | Core | DONE | PR #2, bám `DATABASE_SCHEMA.md` |
| HOST-001 | Deploy SPA lên Firebase Hosting | Hosting | IN_PROGRESS | Dùng Cloud Shell/CLI, sau đó đăng nhập owner lần đầu |

## Giai đoạn 1 — Đăng nhập và sản phẩm

| ID | Công việc | Phạm vi | Trạng thái | Ghi chú |
|---|---|---|---|---|
| AUTH-001 | Đăng nhập Firebase Authentication | `auth` | DONE | Email/Password + protected routes, PR #2 |
| AUTH-002 | Role owner/staff | `auth`, rules | REVIEW | Rules đã Publish; còn bootstrap `/users/{ownerUid}` bằng lần đăng nhập owner đầu tiên |
| PROD-001 | Danh sách sản phẩm | `products` | TODO | Bắt đầu sau khi owner bootstrap thành công |
| PROD-002 | Thêm/sửa sản phẩm | `products` | TODO | |
| PROD-003 | Tìm theo SKU/barcode/QR | `products` | TODO | |
| PROD-004 | Import danh sách sản phẩm từ Excel | `excel`, `products` | TODO | |

## Giai đoạn 2 — Kho

| ID | Công việc | Phạm vi | Trạng thái |
|---|---|---|---|
| INV-001 | Hiển thị tồn kho | `inventory` | TODO |
| INV-002 | Stock movement service | `inventory` | TODO |
| PUR-001 | Phiếu nhập hàng | `purchases` | TODO |
| STK-001 | Kiểm kê hàng hóa | `stocktake` | TODO |
| STK-002 | Điều chỉnh chênh lệch sau kiểm kê | `stocktake`, `inventory` | TODO |

## Giai đoạn 3 — Bán hàng

| ID | Công việc | Phạm vi | Trạng thái |
|---|---|---|---|
| SALE-001 | Màn hình POS/giỏ hàng | `sales` | TODO |
| SALE-002 | Tạo đơn và trừ kho an toàn | `sales`, `inventory` | TODO |
| SALE-003 | Lịch sử đơn hàng | `sales` | TODO |
| SALE-004 | Hủy/hoàn đơn có hoàn kho | `sales`, `inventory` | TODO |

## Giai đoạn 4 — QR và in tem

| ID | Công việc | Phạm vi | Trạng thái |
|---|---|---|---|
| QR-001 | Quét QR bằng camera điện thoại | `qr` | TODO |
| QR-002 | Chế độ quét liên tục | `qr` | TODO |
| QR-003 | Tạo QR cho sản phẩm | `qr`, `products` | TODO |
| PRINT-001 | Thiết kế mẫu tem | `printing` | TODO |
| PRINT-002 | Hỗ trợ nhiều khổ tem | `printing` | TODO |
| PRINT-003 | In qua browser print | `printing` | TODO |

## Giai đoạn 5 — Báo cáo

| ID | Công việc | Phạm vi | Trạng thái |
|---|---|---|---|
| REP-001 | Doanh thu theo ngày/tuần/tháng/quý/năm | `reports` | TODO |
| REP-002 | Giá vốn và lợi nhuận | `reports` | TODO |
| REP-003 | Báo cáo tồn kho | `reports` | TODO |
| REP-004 | Xuất Excel | `reports`, `excel` | TODO |

## Quy tắc nhận việc cho AI module

Khi giao một nhiệm vụ, AI trung tâm sẽ cung cấp tối thiểu:

1. Task ID.
2. Module/phạm vi file được sửa.
3. Tiêu chí hoàn thành.
4. Những interface/schema phải tuân thủ.
5. Những file không được sửa.

AI module phải báo lại các file đã thay đổi, quyết định kỹ thuật đáng chú ý, cách kiểm thử và các vấn đề còn tồn tại.

## Việc ưu tiên tiếp theo

1. Deploy bản build lên Firebase Hosting (`HOST-001`).
2. Đăng nhập lần đầu bằng tài khoản owner để bootstrap `/users/{ownerUid}`.
3. Xác nhận owner truy cập thành công; đánh dấu `AUTH-002` và `HOST-001` DONE.
4. Bắt đầu `PROD-001` và `PROD-002` trên branch riêng.
