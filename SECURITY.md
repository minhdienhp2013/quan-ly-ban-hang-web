# SECURITY — Nguyên tắc bảo mật dự án

## 1. Không đưa bí mật vào GitHub

Tuyệt đối không commit:

- Mật khẩu tài khoản.
- Firebase service account JSON.
- Private key.
- Token truy cập.
- Dữ liệu khách hàng thật hoặc dữ liệu nhạy cảm dùng để thử nghiệm.

Firebase Web config không phải là cơ chế bảo mật. Quyền truy cập dữ liệu phải được kiểm soát bằng Authentication và Firebase Security Rules.

## 2. Biến môi trường

Các giá trị cấu hình Firebase Web được đọc từ biến môi trường Vite, ví dụ:

```text
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Chỉ commit file `.env.example` không chứa giá trị thật. File `.env` phải nằm trong `.gitignore`.

## 3. Firebase Security Rules

Môi trường thực tế không được dùng:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

Mọi request dữ liệu cần gắn với người dùng đã xác thực và kiểm tra role/quyền phù hợp.

## 4. Role

Tối thiểu có:

- `owner`: quản trị hệ thống và xem thông tin nhạy cảm như giá vốn/lợi nhuận.
- `staff`: chỉ các chức năng được cấp.

Không cho client tự cấp hoặc sửa role của chính mình.

## 5. Các thao tác nhạy cảm

Phải có kiểm tra quyền và audit log cho tối thiểu:

- Điều chỉnh tồn kho thủ công.
- Hủy/hoàn đơn.
- Sửa giá vốn.
- Thay đổi role/tài khoản.
- Import dữ liệu hàng loạt.

## 6. An toàn dữ liệu

- Ưu tiên transaction/multi-location update cho nghiệp vụ kho.
- Hạn chế xóa vĩnh viễn dữ liệu giao dịch.
- Có cơ chế sao lưu/export định kỳ trước khi đưa hệ thống vào vận hành thật.
- Kiểm tra file Excel trước khi import; không tin dữ liệu đầu vào mặc định.

## 7. Khi phát hiện lỗi bảo mật

Không công khai secret hoặc dữ liệu mẫu nhạy cảm trong issue/PR. Nếu secret từng bị commit, phải thu hồi/rotate secret; chỉ xóa commit không đủ để coi secret là an toàn.
