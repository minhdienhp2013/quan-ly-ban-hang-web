import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { RequireOwner } from './auth/RequireOwner';
import AppLayout from './layout/AppLayout';
import CustomersPage from './modules/customers/CustomersPage';
import ExpensesPage from './modules/expenses/ExpensesPage';
import InventoryWorkspacePage from './modules/inventory/InventoryWorkspacePage';
import ProductsWorkspacePage from './modules/products/ProductsWorkspacePage';
import './modules/products/products.css';
import PurchasesPage from './modules/purchases/PurchasesPage';
import QrPrintingPage from './modules/qr/QrPrintingPage';
import ReportsPage from './modules/reports/ReportsPage';
import SalesPage from './modules/sales/SalesPage';
import StockOutPage from './modules/stockout/StockOutPage';
import StocktakePage from './modules/stocktake/StocktakePage';
import SuppliersPage from './modules/suppliers/SuppliersPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ModulePlaceholderPage from './pages/ModulePlaceholderPage';

const modulePages = {
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
              <Route path="sales" element={<SalesPage />} />
              <Route path="purchases" element={<PurchasesPage />} />
              <Route path="inventory" element={<InventoryWorkspacePage />} />
              <Route path="stockouts" element={<StockOutPage />} />
              <Route path="stocktakes" element={<StocktakePage />} />
              <Route path="qr-printing" element={<QrPrintingPage />} />

              <Route element={<RequireOwner />}>
                <Route path="expenses" element={<ExpensesPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="users" element={<ModulePlaceholderPage title={modulePages.users[0]} description={modulePages.users[1]} />} />
                <Route path="settings" element={<ModulePlaceholderPage title={modulePages.settings[0]} description={modulePages.settings[1]} />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
