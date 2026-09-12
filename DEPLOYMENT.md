# DEPLOYMENT — Hosting/domain riêng

Tài liệu triển khai frontend của dự án `quan-ly-ban-hang-web`.

## Mục tiêu

- Ứng dụng không phụ thuộc Firebase Hosting.
- Firebase chỉ cung cấp Authentication và Realtime Database.
- React/Vite được build thành thư mục `dist/`.
- Sau này người dùng có thể upload `dist/` lên hosting/domain riêng hoặc bất kỳ static hosting tương thích SPA.

## 1. Chuẩn bị cấu hình Firebase khi build

Tạo file `.env.local` hoặc `.env.production` dựa trên `.env.example`:

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

Không commit `.env.local` hoặc `.env.production` có giá trị thật lên GitHub.

Firebase Web config được nhúng vào bundle frontend khi build. Đây không phải service-account secret; bảo mật dữ liệu phải dựa vào Authentication + Realtime Database Rules.

## 2. Build website

```bash
npm install
npm run build
```

Build thành công tạo thư mục:

```text
dist/
```

Đây là thư mục cần đưa lên hosting sau này.

## 3. Yêu cầu với hosting

Hosting cần:

- Phục vụ file tĩnh HTML/CSS/JS.
- Có HTTPS khi chạy thực tế.
- Cho phép SPA fallback/rewrite: các URL như `/products`, `/sales`, `/settings` phải trả về `index.html` khi không trùng file tĩnh.

Ví dụ với Apache có thể cần `.htaccess`; Nginx/cPanel/Vercel/Netlify/Cloudflare Pages có cách rewrite riêng. Chỉ cấu hình khi biết hosting thực tế của người dùng.

## 4. Firebase Authentication với domain riêng

Sau khi có domain thật, vào Firebase Console:

`Authentication → Settings → Authorized domains`

Thêm domain của website, ví dụ:

```text
banhang.tenmiencuaban.vn
```

Nếu không thêm authorized domain, Firebase Authentication có thể từ chối luồng đăng nhập trên domain mới.

## 5. Bootstrap owner lần đầu

Sau khi website được chạy ở local hoặc hosting thực tế:

1. Đăng nhập bằng tài khoản Email/Password có UID owner đã cấu hình trong `src/config/security.ts`.
2. Ứng dụng tạo `/users/{ownerUid}` nếu hồ sơ chưa tồn tại.
3. Hồ sơ phải có `role: owner` và `active: true`.
4. Sau đó owner truy cập các route quản trị.

Việc bootstrap owner không bắt buộc phải làm ngay trong giai đoạn viết phần mềm; có thể thực hiện khi người dùng sẵn sàng chạy website.

## 6. Cập nhật phiên bản sau này

```bash
git pull
npm install
npm run build
```

Sau đó upload nội dung mới trong `dist/` lên hosting hiện tại.

## 7. Firebase CLI

`firebase.json` hiện chỉ được giữ để quản lý `database.rules.json`. Không có cấu hình Firebase Hosting và không chạy `firebase deploy --only hosting` trong dự án này.
