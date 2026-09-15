# AGENTS.md — Repo-wide instructions for coding agents

File này áp dụng cho toàn bộ repository `quan-ly-ban-hang-web`.

Mục tiêu: **đúng chức năng + ít code nhất hợp lý + reuse tối đa + không phá contract hiện có**.

## 1. Thứ tự ưu tiên

Khi có xung đột, ưu tiên theo thứ tự:

1. `PROJECT_RULES.md`
2. `ARCHITECTURE.md`
3. `DATABASE_SCHEMA.md`
4. `SECURITY.md`
5. `MODULE_COORDINATION.md`
6. `AI_TASKS.md`
7. `DEPLOYMENT.md`
8. `src/types/models.ts`
9. `database.rules.json`
10. implementation hiện tại trên `main`
11. quy tắc tối giản/reuse trong file này

Quy tắc tối giản không được ghi đè correctness, data integrity, inventory consistency, security, permissions, accessibility, error handling, transaction safety, idempotency hoặc auditability.

## 2. Trước khi viết code

Đi theo ladder này và dừng ở bậc đầu tiên giải quyết đúng bài toán:

1. Có thực sự cần build không? Nếu chỉ là speculative need → YAGNI.
2. Repo đã có helper/service/component/type/pattern tương tự chưa? → reuse.
3. Stdlib / JavaScript / TypeScript đã có chưa? → dùng cái có sẵn.
4. Browser/HTML/CSS/React native pattern đã đủ chưa? → dùng native.
5. Dependency đang cài đã giải quyết chưa? → reuse dependency hiện có.
6. Có thể extend một điểm chung nhỏ thay vì tạo implementation thứ hai không? → extend.
7. Chỉ khi các bước trên không đủ mới tạo code/file/abstraction mới.

Chuỗi bắt buộc:

`SEARCH → READ → TRACE → REUSE → EXTEND → CREATE`

Không `CREATE trước rồi mới đi tìm`.

## 3. Root cause first

Với bug/regression:

- xác định symptom;
- trace data/control flow end-to-end;
- tìm root cause;
- kiểm tra caller/use case liên quan;
- sửa tại điểm chung nhỏ nhất phù hợp ownership;
- thêm regression test.

Không vá một màn hình nếu nguyên nhân thực nằm trong shared helper/service/component.

## 4. Không tạo hệ thống song song

- Inventory/Sales/Purchase/StockOut/Stocktake phải dùng stock operation/CAS contract hiện có.
- Không ghi trực tiếp `stockQuantity`/`stockVersion` nếu flow chuẩn đã tồn tại.
- Products không tự tạo stock writer.
- QR/Barcode/Printing reuse Product/search/handoff contract.
- CRM không duplicate Customer/Supplier model.
- Reports không tạo nguồn doanh thu/COGS/profit thứ hai.
- Nếu nhiều module cần cùng logic, xác định một owner và một shared implementation.

## 5. Native/dependency policy

Ưu tiên HTML/CSS/browser APIs và dependency đang cài.

Không thêm package chỉ để thay một khả năng native hoặc helper đã có.

Nếu thật sự cần dependency mới, PR phải giải thích:

- native/current dependency nào đã được đánh giá;
- vì sao không đủ;
- ảnh hưởng bundle/security/maintenance;
- vì sao dependency mới là lựa chọn nhỏ và an toàn hơn.

Không thêm coding-agent plugin vào runtime dependencies của ứng dụng. Đây là project React runtime, còn quy tắc agent được quản lý bằng docs repo.

## 6. Scope và ownership

AI/module owner chỉ sửa phạm vi được giao.

Nếu phát hiện tech debt ngoài scope: ghi `FOLLOW-UP / TECH DEBT`, không tự refactor.

Nếu cần sửa shared service hoặc vùng owner khác: báo AI trung tâm trước.

## 7. Stop conditions

DỪNG và báo AI trung tâm trước khi code nếu task yêu cầu mà chưa được cấp quyền rõ ràng:

- thay schema/node/path database;
- thay shared model/type contract;
- sửa `database.rules.json`/permission;
- đổi stock CAS/stockVersion/idempotency;
- thêm write path nghiệp vụ mới;
- đổi module ownership;
- thêm dependency ảnh hưởng kiến trúc;
- sửa shared service có nhiều caller.

## 8. Pre-code report

Trước implementation, báo ngắn:

A. Đã đọc file nào.

B. Đã search code tương tự ở đâu.

C. Sẽ reuse gì.

D. Dự kiến sửa file nào.

E. Sẽ không sửa file/shared contract nào.

F. Root cause hoặc implementation point nhỏ nhất là gì.

G. Có đổi schema/security/shared contract/dependency/ownership không.

Nếu G = có → dừng.

## 9. Implementation style

Ưu tiên:

- boring code > clever code;
- existing pattern > new abstraction;
- fewer states/side effects > more layers;
- small diff > rewrite, sau khi đã hiểu flow;
- one source of truth;
- one contract;
- one implementation per responsibility.

Không tạo:

- wrapper vô nghĩa;
- interface chỉ để trang trí;
- helper vài dòng nếu không tăng clarity/reuse;
- abstraction “để sau này dùng”;
- framework/pattern mới nếu repo hiện tại đã đủ.

## 10. Tests

Dùng framework test hiện có. Không dựng test framework mới nếu không cần.

Logic không trivial phải có test phù hợp; bug phải có regression test.

Ưu tiên test contract cho:

- inventory/CAS;
- sale/purchase/stockout/stocktake;
- money/COGS/profit;
- permissions/Firebase writes;
- QR/barcode lookup;
- printing handoff;
- draft/idempotency/data-loss boundaries.

## 11. Completion report

Sau implementation phải báo:

- branch/base SHA/head SHA/PR;
- files changed;
- implementation đã reuse;
- code mới thực sự cần thiết;
- tests/build/CI;
- contract đã kiểm tra;
- known limitations;
- schema/security/dependency changes;
- impact/conflict module khác.

## 12. Central review gate

Không merge chỉ vì code chạy.

Trước merge phải kiểm tra:

- scope;
- reuse/duplication;
- parallel system;
- unnecessary dependency/abstraction/file;
- shared contract/schema/Rules;
- stock/CAS/idempotency;
- race/data-loss/security/permission;
- responsive/accessibility;
- regression tests;
- diff có thể nhỏ hơn mà vẫn giữ correctness hay không.

## 13. Ghi chú nguồn ý tưởng

Kỷ luật `reuse-first / YAGNI / native-first / minimum-code` trong file này được điều chỉnh cho dự án từ các ý tưởng của Ponytail (Dietrich Gebert, MIT), nhưng **luật và contract của repository này luôn thắng** nếu có xung đột.
