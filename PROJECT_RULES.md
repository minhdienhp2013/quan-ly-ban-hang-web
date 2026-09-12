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
- Firebase Hosting hoặc hosting tĩnh tương thích SPA.
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
