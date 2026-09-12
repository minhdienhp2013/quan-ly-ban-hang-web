import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { RequireOwner } from './auth/RequireOwner';
import AppLayout from './layout/AppLayout';
import CustomersPage from './modules/customers/CustomersPage';
import ExpensesPage from './modules/expenses/ExpensesPage';
import ProductsWorkspacePage from './modules/products/ProductsWorkspacePage';
import './modules/products/products.css';
import SuppliersPage from './modules/suppliers/SuppliersPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ModulePlaceholderPage from './pages/ModulePlaceholderPage';

const modulePages = {
  sales: ['Bán hàng', 'Màn hình POS, giỏ hàng, thanh toán và lịch sử đơn bán.'],
  purchases: ['Nhập hàng', 'Tạo phiếu nhập, cập nhật giá vốn và tăng tồn kho.'],
  inventory: ['Kho', 'Theo dõi tồn kho và nhật ký biến động hàng hóa.'],
  stocktakes: ['Kiểm kê', 'Kiểm kê thực tế, chênh lệch và điều chỉnh tồn kho có truy vết.'],
  'qr-printing': ['QR & In tem', 'Quét QR bằng camera, tạo mã và in tem trên trình duyệt.'],
  reports: ['Báo cáo', 'Doanh thu, giá vốn, lợi nhuận và báo cáo tồn kho theo thời gian.'],
  users: ['Người dùng', 'Quản lý nhân viên, trạng thái tài khoản và quyền truy cập.'],
  settings: ['Cài đặt', 'Thông tin cửa hàng và cấu hình mặc định của hệ thống.'],
} as const;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="products" element={<ProductsWorkspacePage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="suppliers" element={<SuppliersPage />} />
              <Route
                path="sales"
                element={<ModulePlaceholderPage title={modulePages.sales[0]} description={modulePages.sales[1]} />}
              />
              <Route
                path="purchases"
                element={<ModulePlaceholderPage title={modulePages.purchases[0]} description={modulePages.purchases[1]} />}
              />
              <Route
                path="inventory"
                element={<ModulePlaceholderPage title={modulePages.inventory[0]} description={modulePages.inventory[1]} />}
              />
              <Route
                path="stocktakes"
                element={<ModulePlaceholderPage title={modulePages.stocktakes[0]} description={modulePages.stocktakes[1]} />}
              />
              <Route
                path="qr-printing"
                element={<ModulePlaceholderPage title={modulePages['qr-printing'][0]} description={modulePages['qr-printing'][1]} />}
              />
              <Route
                path="reports"
                element={<ModulePlaceholderPage title={modulePages.reports[0]} description={modulePages.reports[1]} />}
              />

              <Route element={<RequireOwner />}>
                <Route path="expenses" element={<ExpensesPage />} />
                <Route
                  path="users"
                  element={<ModulePlaceholderPage title={modulePages.users[0]} description={modulePages.users[1]} />}
                />
                <Route
                  path="settings"
                  element={<ModulePlaceholderPage title={modulePages.settings[0]} description={modulePages.settings[1]} />}
                />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
