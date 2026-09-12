import { firebaseReady, realtimeDatabaseReady } from './firebase/client';

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return <span className={ok ? 'status status--ok' : 'status status--pending'}>{label}</span>;
}

export default function App() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Dự án quản lý bán hàng</p>
        <h1>Hệ thống đã khởi động</h1>
        <p className="lead">
          Bộ khung React + TypeScript + Vite đã sẵn sàng. Bước tiếp theo là hoàn thiện
          Firebase Realtime Database, đăng nhập và giao diện quản trị.
        </p>

        <div className="status-grid" aria-label="Trạng thái nền tảng">
          <StatusBadge ok={true} label="React / Vite: sẵn sàng" />
          <StatusBadge ok={firebaseReady} label="Firebase App: đã cấu hình" />
          <StatusBadge
            ok={realtimeDatabaseReady}
            label={
              realtimeDatabaseReady
                ? 'Realtime Database: sẵn sàng'
                : 'Realtime Database: chờ databaseURL'
            }
          />
        </div>
      </section>
    </main>
  );
}
