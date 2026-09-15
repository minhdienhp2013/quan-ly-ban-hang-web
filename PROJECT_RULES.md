# PROJECT RULES — Quy tắc bắt buộc

Tài liệu này là quy tắc chung cho mọi AI, đoạn chat và người phát triển tham gia dự án `quan-ly-ban-hang-web`.

## 1. Nguồn sự thật chung

- GitHub repository này là nguồn sự thật duy nhất của mã nguồn và tài liệu kỹ thuật.
- Không coi nội dung trong một đoạn chat riêng lẻ là quyết định cuối cùng nếu chưa được phản ánh vào repository.
- Trước khi sửa code, phải đọc tối thiểu: `PROJECT_RULES.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `AI_TASKS.md`.

## 2. Vai trò AI trung tâm

- AI trung tâm chịu trách nhiệm kiến trúc tổng thể, schema dữ liệu, giao diện giữa các module, quy tắc bảo mật và việc ghép thay đổi.
- AI module chỉ được thay đổi phạm vi được giao.
- Nếu cần thay đổi schema, kiểu dữ liệu dùng chung, cấu trúc thư mục hoặc quyền Firebase, AI module phải đề xuất trước; không tự ý đổi.

## 3. Quy tắc Git

- `main` là nhánh ổn định.
- Không phát triển tính năng lớn trực tiếp trên `main`.
- Tên branch theo mẫu: `feature/<ten-module>`, `fix/<mo-ta-ngan>`, `docs/<noi-dung>`.
- Mỗi Pull Request chỉ nên giải quyết một mục tiêu rõ ràng.
- Không ghi đè code của module khác nếu chưa kiểm tra tác động.

## 4. Công nghệ chuẩn

- Frontend: React + TypeScript + Vite.
- Firebase Authentication cho đăng nhập.
- Firebase Realtime Database cho dữ liệu nghiệp vụ ban đầu.
- Frontend được build thành static assets và đưa lên hosting/domain riêng của người dùng; không phụ thuộc Firebase Hosting.
- Ứng dụng phải chạy trên trình duyệt máy tính và điện thoại.

Không tự đổi framework hoặc database chính nếu chưa có quyết định kiến trúc được ghi vào `ARCHITECTURE.md`.

## 5. Quy tắc code

- TypeScript bật kiểm tra kiểu nghiêm ngặt khi có thể.
- Không dùng `any` nếu có thể mô hình hóa kiểu dữ liệu rõ ràng.
- Logic nghiệp vụ không đặt trực tiếp trong component giao diện nếu có thể tách thành service/hook.
- Không sao chép cùng một logic ở nhiều module.
- Các giá trị tiền tệ lưu dưới dạng số nguyên VND, không lưu chuỗi đã định dạng.
- Mốc thời gian lưu theo chuẩn thống nhất; hiển thị theo múi giờ người dùng.
- Mọi thao tác làm thay đổi tồn kho phải để lại dấu vết giao dịch kho.

## 6. Bảo mật

- Không commit mật khẩu, token, service account JSON, private key hay dữ liệu khách hàng thật.
- Firebase Web config có thể được cung cấp qua biến môi trường, nhưng bảo mật thực tế phải dựa vào Firebase Security Rules và Authentication.
- Không dùng rules kiểu `.read: true` và `.write: true` trong môi trường thật.
- Mỗi người dùng phải có vai trò rõ ràng.

## 7. Dữ liệu và tồn kho

- Không chỉnh `stockQuantity` tùy tiện từ giao diện nếu không tạo giao dịch kho tương ứng.
- Nhập hàng, bán hàng, kiểm kê, trả hàng và điều chỉnh phải tạo stock movement.
- Xóa dữ liệu nghiệp vụ ưu tiên soft-delete/trạng thái thay vì xóa vĩnh viễn nếu cần truy vết.

## 8. Hoàn thành một module

Một module chỉ được coi là hoàn thành khi:

1. Build không lỗi.
2. Không phá module hiện có.
3. Có kiểu dữ liệu rõ ràng.
4. Có xử lý trạng thái loading/error chính.
5. Tuân thủ quyền người dùng.
6. Tài liệu liên quan được cập nhật nếu có thay đổi kiến trúc/schema.
7. Có mô tả cách kiểm thử thủ công hoặc test tự động phù hợp.

## 9. Quy tắc dành cho mọi AI trước khi bắt đầu nhiệm vụ

AI phải trả lời được 4 câu hỏi trước khi sửa code:

- Tôi đang sửa module nào?
- Tôi được phép sửa những file/phạm vi nào?
- Tôi đang phụ thuộc vào interface/schema nào?
- Thay đổi này có ảnh hưởng module khác không?

Nếu có ảnh hưởng kiến trúc hoặc schema, phải dừng việc tự ý thay đổi và chuyển đề xuất cho AI trung tâm.

## 10. Kỷ luật engineering toàn repo: reuse-first, minimum-code

Mọi AI/người phát triển phải đi theo thứ tự sau **trước khi viết code mới**:

1. Tính năng/code này có thực sự cần tồn tại không? Nếu chỉ là nhu cầu suy đoán, áp dụng YAGNI.
2. Search vùng code liên quan để tìm helper/service/component/type/pattern đã tồn tại.
3. Đọc và trace luồng dữ liệu end-to-end trước khi sửa.
4. Reuse implementation hiện có nếu đáp ứng contract.
5. Nếu reuse chưa đủ, ưu tiên extend điểm chung nhỏ nhất.
6. Ưu tiên JavaScript/TypeScript/React/browser native API và CSS/HTML native khi chúng đáp ứng đủ yêu cầu.
7. Ưu tiên dependency đã cài sẵn trước khi thêm dependency mới.
8. Chỉ sau các bước trên mới được tạo implementation mới, với diff/file/state/side-effect ít nhất hợp lý.

Phương châm:

`SEARCH → READ → TRACE → REUSE → EXTEND → CREATE`

Không được làm ngược thành `CREATE trước rồi mới đi tìm`.

Các nguyên tắc tối giản **không bao giờ được dùng để hy sinh**: correctness, data integrity, inventory consistency, security, permissions, accessibility, error handling, transaction safety, idempotency hoặc auditability.

Ưu tiên:

- existing pattern > new abstraction;
- boring code > clever code;
- small diff > rewrite, sau khi đã hiểu luồng;
- một contract + một implementation cho mỗi trách nhiệm;
- không tạo hệ thống song song.

Không tạo abstraction chỉ vì “sau này có thể dùng”. Chỉ tạo shared abstraction khi đã có nhu cầu thực, duplicate logic thực sự tồn tại hoặc contract chung cần một owner rõ ràng.

## 11. Root cause first

Khi xử lý bug:

1. Xác định symptom.
2. Trace data/control flow.
3. Tìm root cause.
4. Kiểm tra caller/use case liên quan.
5. Sửa tại điểm chung nhỏ nhất phù hợp ownership.
6. Thêm regression test cho lỗi thực tế.

Không vá riêng một màn hình nếu nguyên nhân nằm trong shared helper/service/component và các caller khác cũng có nguy cơ gặp cùng lỗi.

## 12. Shared code và chống hệ thống song song

- Inventory/Sales/Purchase/StockOut/Stocktake phải dùng stock/CAS contract hiện có; không tạo stock updater riêng.
- Products quản lý metadata theo contract; không tự tạo đường sửa tồn kho.
- QR/Barcode/Printing phải reuse Product/search/handoff contract hiện có; không tạo product database/search engine thứ hai.
- CRM không duplicate Customer/Supplier model trong module khác.
- Reports phải đọc transaction/source chuẩn; không tạo nguồn doanh thu/lợi nhuận thứ hai.
- Nếu nhiều module cần cùng một chức năng, AI trung tâm phải xác định owner cho shared implementation trước khi code.

## 13. Dependency và native-platform policy

Không thêm dependency chỉ để thay một khả năng native hoặc helper đang có.

Trước khi thêm dependency phải ghi rõ trong PR:

- native/stdlib/current dependency nào đã được đánh giá;
- vì sao chúng không đủ;
- ảnh hưởng bundle/security/maintenance;
- lý do dependency mới là lựa chọn nhỏ và an toàn hơn.

Không cài package/agent plugin phát triển vào runtime app chỉ để áp dụng quy tắc coding. Các quy tắc cho coding agent được quản lý bằng tài liệu repo (`AGENTS.md`, `PROJECT_RULES.md`, `MODULE_COORDINATION.md`).

## 14. Pre-code stop conditions

AI/module owner phải **DỪNG và báo AI trung tâm** nếu implementation yêu cầu một trong các việc sau mà task chưa cấp quyền rõ ràng:

- đổi database schema/node/path;
- đổi `src/types/models.ts` shared contract;
- đổi Firebase Security Rules hoặc permission;
- đổi stock CAS/stockVersion/idempotency contract;
- thêm write path nghiệp vụ mới;
- đổi module ownership;
- sửa shared service mà nhiều module phụ thuộc;
- thêm dependency mới có ảnh hưởng kiến trúc.

Chi tiết quy trình giao việc, báo cáo pre-code và PR review nằm trong `MODULE_COORDINATION.md` và `AGENTS.md`.
