import { useState, type FormEvent } from 'react';
import { FirebaseError } from 'firebase/app';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Navigate } from 'react-router-dom';
import { auth } from '../firebase/client';
import { useAuth } from '../auth/AuthContext';

function getLoginError(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return 'Không thể đăng nhập. Vui lòng thử lại.';
  }

  switch (error.code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Email hoặc mật khẩu không đúng.';
    case 'auth/too-many-requests':
      return 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.';
    case 'auth/user-disabled':
      return 'Tài khoản Firebase Authentication này đã bị vô hiệu hóa.';
    default:
      return `Đăng nhập thất bại (${error.code}).`;
  }
}

export default function LoginPage() {
  const { appUser, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!loading && appUser) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      setErrorMessage(getLoginError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="auth-card">
        <p className="eyebrow">Quản lý bán hàng</p>
        <h1>Đăng nhập</h1>
        <p className="muted">Dùng tài khoản đã được tạo trong Firebase Authentication.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ten@cuahang.vn"
            />
          </label>

          <label>
            <span>Mật khẩu</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </label>

          {errorMessage ? <p className="form-error">{errorMessage}</p> : null}

          <button className="button button--primary button--full" type="submit" disabled={submitting}>
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </section>
    </main>
  );
}
