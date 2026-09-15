import { useAuth } from '../../auth/AuthContext';
import BackupPanel from '../backup/BackupPanel';
import BusinessDataResetPanel from '../backup/BusinessDataResetPanel';
import '../reports/reports.css';
import './settings.css';

export default function SettingsPage() {
  const { appUser } = useAuth();
  if (!appUser || appUser.role !== 'owner') return null;

  return (
    <div className="settings-shell">
      <header className="settings-header">
        <div>
          <p className="eyebrow">CÀI ĐẶT</p>
          <h1>Dữ liệu / Backup</h1>
          <p className="muted">
            Sao lưu dữ liệu và quản lý các thao tác phá hủy dành riêng cho Chủ cửa hàng.
          </p>
        </div>
      </header>

      <BackupPanel actorUid={appUser.uid} />

      <div className="settings-danger-heading">
        <p className="eyebrow">KHU VỰC NGUY HIỂM</p>
        <h2>Thao tác dữ liệu không thể hoàn tác</h2>
        <p className="muted">Chỉ sử dụng khi cần bắt đầu lại toàn bộ dữ liệu hàng hóa và giao dịch.</p>
      </div>

      <BusinessDataResetPanel actorUid={appUser.uid} />
    </div>
  );
}
