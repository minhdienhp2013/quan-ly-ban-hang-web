import { useAuth } from '../auth/AuthContext';

const modules = [
  ['Sản phẩm', 'Quản lý danh mục, mã hàng, giá bán và tồn kho.'],
  ['Bán hàng', 'Tạo đơn, quét mã và ghi nhận doanh thu.'],
  ['Nhập hàng', 'Nhập kho và cập nhật giá vốn.'],
  ['Kiểm kê', 'Đối chiếu tồn kho thực tế và hệ thống.'],
  ['QR & In tem', 'Tạo, quét và in mã QR theo khổ tem.'],
  ['Báo cáo', 'Theo dõi doanh thu, lợi nhuận và tồn kho.'],
] as const;

export default function DashboardPage() {
  const { appUser } = useAuth();

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Tổng quan</p>
          <h1>Xin chào, {appUser?.displayName ?? 'bạn'}</h1>
          <p className="muted">Nền tảng lõi đã sẵn sàng để phát triển từng module nghiệp vụ.</p>
        </div>
      </div>

      <div className="module-grid">
        {modules.map(([title, description]) => (
          <article className="module-card" key={title}>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
