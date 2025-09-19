import React, { useEffect, useState } from 'react';
import AuthForm from '../components/AuthForm';
import { useAppContext } from '../context/AppContext';
import { toast } from 'react-hot-toast';
import type { AxiosError } from 'axios';
import { Link } from 'react-router-dom';
import type { User } from '../types';

const Login: React.FC = () => {
  const { axios, login, navigate, user } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [twoFactorPending, setTwoFactorPending] = useState<{
    token: string;
    method: string;
  } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleLogin = async (data: { email: string; password: string }) => {
    setTwoFactorPending(null);
    setTwoFactorCode('');
    setTwoFactorError(null);
    setLoading(true);
    try {
      const res = await axios.post('/api/login', {
        email: data.email,
        password: data.password,
      });

      if ('user' in res.data && res.data.user) {
        const payload = res.data.user as Partial<User> & {
          username: string;
          uuid: string;
        };
        const normalized: User = {
          username: payload.username,
          uuid: payload.uuid,
          avatar: payload.avatar ?? null,
          id: payload.id ?? 0,
          email: payload.email ?? '',
          wins: payload.wins ?? 0,
          losses: payload.losses ?? 0,
          createdAt: payload.createdAt ?? '',
          tfaEnabled: Boolean(
            (payload as any).tfa ??
              payload.tfaEnabled ??
              (payload as any).twoFactorEnabled ??
              false,
          ),
        };
        login(normalized);
        toast.success('Logged in');
        return;
      }

      if (res.data?.twoFactorRequired) {
        setTwoFactorPending({
          token: res.data.pendingToken as string,
          method: (res.data.method as string) || 'totp',
        });
        toast('Enter your authentication code to finish logging in.');
        return;
      }

      throw new Error('Invalid server response');
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      toast.error(String(axiosErr?.response?.data?.message || err?.message || 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorPending) return;
    if (!twoFactorCode.trim()) {
      setTwoFactorError('Введите код из приложения.');
      return;
    }
    setTwoFactorLoading(true);
    setTwoFactorError(null);
    try {
      const res = await axios.post('/api/login/tfa', {
        token: twoFactorPending.token,
        code: twoFactorCode,
      });
      if (!res.data?.user) throw new Error('Invalid server response');
      const payload = res.data.user as Partial<User> & {
        username: string;
        uuid: string;
      };
      const normalized: User = {
        username: payload.username,
        uuid: payload.uuid,
        avatar: payload.avatar ?? null,
        id: payload.id ?? 0,
        email: payload.email ?? '',
        wins: payload.wins ?? 0,
        losses: payload.losses ?? 0,
        createdAt: payload.createdAt ?? '',
        tfaEnabled: Boolean(
          (payload as any).tfa ?? payload.tfaEnabled ?? (payload as any).twoFactorEnabled ?? false,
        ),
      };
      login(normalized);
      toast.success('2FA confirmed, welcome back!');
      setTwoFactorPending(null);
      setTwoFactorCode('');
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ message?: string; error?: string }>;
      const message =
        axiosErr?.response?.data?.message || axiosErr?.response?.data?.error || err?.message;
      setTwoFactorError(String(message || 'Verification failed'));
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const resetTwoFactorState = () => {
    setTwoFactorPending(null);
    setTwoFactorCode('');
    setTwoFactorError(null);
    setTwoFactorLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold">Login</h1>
        {!twoFactorPending ? (
          <>
            <AuthForm type="login" onSubmit={handleLogin} />
            {loading && <p className="mt-2 text-sm">Authenticating…</p>}
          </>
        ) : (
          <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
            <p className="text-sm text-gray-700">
              Two-factor authentication is enabled. Enter the code from your authenticator app to
              continue.
            </p>
            <label className="block text-sm font-medium text-gray-700" htmlFor="twoFactorCode">
              Authentication code
            </label>
            <input
              id="twoFactorCode"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              className="w-full rounded border border-gray-300 px-3 py-2"
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value)}
            />
            {twoFactorError && <p className="text-sm text-red-500">{twoFactorError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                disabled={twoFactorLoading}
              >
                {twoFactorLoading ? 'Verifying…' : 'Verify code'}
              </button>
              <button
                type="button"
                className="rounded border border-gray-300 px-4 py-2 text-sm"
                onClick={resetTwoFactorState}
                disabled={twoFactorLoading}
              >
                Back
              </button>
            </div>
          </form>
        )}
        <span className="text-gray-600">Don't have an account yet?</span>
        <Link to="/signup" className="ml-2 text-blue-700">
          Sign Up
        </Link>
      </div>
    </div>
  );
};

export default Login;
