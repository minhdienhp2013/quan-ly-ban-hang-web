import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

type NavigationItem = {
  to: string;
  label: string;
  ownerOnly?: boolean;
};

const navigation: NavigationItem[] = [
  { to: '/', label: 'Tổng quan' },
  { to: '/products', label: 'Hàng hóa' },
  { to: '/customers', label: 'Khách hàng' },
  { to: '/suppliers', label: 'Nhà cung cấp' },
  { to: '/sales', label: 'Bán hàng' },
  { to: '/purchases', label: 'Nhập hàng' },
  { to: '/inventory', label: 'Kho' },
  { to: '/stockouts', label: 'Xuất kho' },
  { to: '/stocktakes', label: 'Kiểm kê' },
  { to: '/expenses', label: 'Chi phí', ownerOnly: true },
  { to: '/qr-printing', label: 'QR & In tem' },
  { to: '/reports', label: 'Báo cáo & Backup', ownerOnly: true },
  { to: '/users', label: 'Người dùng', ownerOnly: true },
  { to: '/settings', label: 'Cài đặt', ownerOnly: true },
];

export default function AppLayout() {
  const { appUser, logout } = useAuth();

  if (!appUser) return null;

  const visibleNavigation = navigation.filter((item) => !item.ownerOnly || appUser.role === 'owner');

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div>
          <p className="sidebar__eyebrow">Quản lý bán hàng</p>
          <h2 className="sidebar__title">Cửa hàng</h2>
        </div>

        <nav className="sidebar__nav" aria-label="Điều hướng chính">
          {visibleNavigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__account">
          <strong>{appUser.displayName}</strong>
          <span>{appUser.role === 'owner' ? 'Chủ cửa hàng' : 'Nhân viên'}</span>
          <button className="button button--secondary button--full" type="button" onClick={() => void logout()}>
            Đăng xuất
          </button>
        </div>
      </aside>

      <div className="workspace__main">
        <header className="topbar">
          <div>
            <strong>Hệ thống quản lý bán hàng</strong>
            <span className="topbar__sub">Dữ liệu đồng bộ qua Firebase</span>
          </div>
          <span className="role-badge">{appUser.role === 'owner' ? 'OWNER' : 'STAFF'}</span>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
