# DEPLOYMENT — Firebase Hosting

Tài liệu triển khai cho dự án `quan-ly-ban-hang-web`.

## Mục tiêu

- Build React/Vite thành thư mục `dist/`.
- Deploy `dist/` lên Firebase Hosting.
- Giữ cấu hình Firebase runtime ngoài Git (`.env.local` / `.env.production`).
- Sau deploy, đăng nhập lần đầu bằng tài khoản owner để bootstrap `/users/{ownerUid}`.

## Cách khuyến nghị: Google Cloud Shell trên trình duyệt

Cloud Shell cho phép triển khai mà không cần cài Firebase CLI trực tiếp trên máy cá nhân.

### 1. Clone repository

```bash
git clone https://github.com/minhdienhp2013/quan-ly-ban-hang-web.git
cd quan-ly-ban-hang-web
```

### 2. Tạo file `.env.local`

Tạo file `.env.local` dựa trên `.env.example` và điền cấu hình Firebase Web của dự án. File này nằm trong `.gitignore`; không commit lên GitHub.

Các biến bắt buộc:

```text
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

### 3. Build

```bash
npm install
npm run build
```

Build thành công phải tạo thư mục `dist/`.

### 4. Xác nhận Firebase project

```bash
firebase projects:list
firebase use quan-ly-ban-hang-web
```

### 5. Deploy Hosting

```bash
firebase deploy --only hosting
```

Sau khi thành công, Firebase CLI sẽ trả về URL Hosting. Mở URL đó trên trình duyệt.

## Bootstrap owner lần đầu

1. Mở website Firebase Hosting.
2. Đăng nhập bằng tài khoản Email/Password đã tạo trong Firebase Authentication có UID owner được cấu hình trong `src/config/security.ts`.
3. Ứng dụng sẽ tạo `/users/{ownerUid}` nếu hồ sơ chưa tồn tại.
4. Hồ sơ phải có `role: owner` và `active: true`.
5. Sau đó owner mới có thể truy cập các route quản trị.

## Kiểm tra sau deploy

- Website mở được bằng HTTPS.
- `/login` hoạt động.
- Owner đăng nhập được.
- `/users/{ownerUid}` xuất hiện trong Realtime Database sau đăng nhập đầu tiên.
- Người dùng chưa có hồ sơ/không active không được vào hệ thống.
- `/users` và `/settings` chỉ owner truy cập được.

## Deploy lại khi có phiên bản mới

```bash
git pull
npm install
npm run build
firebase deploy --only hosting
```

Không chạy `firebase init` lại nếu `firebase.json` và `.firebaserc` đã đúng trong repository.
