import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { get, ref, set } from 'firebase/database';
import { auth, db } from '../firebase/client';
import { isOwnerUid } from '../config/security';
import type { AppUser } from '../types/models';

interface AuthContextValue {
  firebaseUser: User | null;
  appUser: AppUser | null;
  loading: boolean;
  accessError: string | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isValidProfile(value: unknown): value is AppUser {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<AppUser>;
  return (
    typeof candidate.uid === 'string' &&
    typeof candidate.displayName === 'string' &&
    (candidate.role === 'owner' || candidate.role === 'staff') &&
    typeof candidate.active === 'boolean' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number'
  );
}

async function loadOrBootstrapProfile(user: User): Promise<AppUser> {
  if (!db) {
    throw new Error('Realtime Database chưa được cấu hình cho ứng dụng.');
  }

  const userRef = ref(db, `users/${user.uid}`);
  const snapshot = await get(userRef);

  if (snapshot.exists()) {
    const profile = snapshot.val() as unknown;
    if (!isValidProfile(profile) || profile.uid !== user.uid) {
      throw new Error('Hồ sơ người dùng trong cơ sở dữ liệu không hợp lệ.');
    }
    return profile;
  }

  if (!isOwnerUid(user.uid)) {
    throw new Error('Tài khoản chưa được Chủ cửa hàng cấp quyền sử dụng hệ thống.');
  }

  const now = Date.now();
  const ownerProfile: AppUser = {
    uid: user.uid,
    displayName: user.displayName?.trim() || 'Chủ cửa hàng',
    role: 'owner',
    active: true,
    createdAt: now,
    updatedAt: now,
    ...(user.email ? { email: user.email } : {}),
  };

  await set(userRef, ownerProfile);
  return ownerProfile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;

      setFirebaseUser(user);
      setAppUser(null);
      setAccessError(null);
      setLoading(true);

      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const profile = await loadOrBootstrapProfile(user);
        if (cancelled) return;

        if (!profile.active) {
          setAccessError('Tài khoản này đã bị khóa.');
          setLoading(false);
          return;
        }

        setAppUser(profile);
      } catch (error) {
        if (cancelled) return;
        setAccessError(error instanceof Error ? error.message : 'Không thể tải quyền người dùng.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      appUser,
      loading,
      accessError,
      logout: () => signOut(auth),
    }),
    [firebaseUser, appUser, loading, accessError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được dùng bên trong AuthProvider.');
  }
  return context;
}
