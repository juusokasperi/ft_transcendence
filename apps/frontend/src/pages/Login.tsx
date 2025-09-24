import React, { useEffect, useState } from 'react';
import AuthForm from '../components/AuthForm';
import { useAppContext } from '../context/AppContext';
import type { AxiosError } from 'axios';
import { Link, useLocation } from 'react-router-dom';
import type { User } from '../types';
import Navbar from '../components/Navbar';
import { useSnackbar } from '../context/SnackbarContext';

const highlights = [
  'Single account for every arcade title',
  'Secure two-factor support out of the box',
  'Track career stats and match history',
];

const Login: React.FC = () => {
  const { axios, login, navigate, user } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();
  const location = useLocation();
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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const pendingToken = params.get('pendingToken');
    if (!pendingToken) return;

    setTwoFactorPending({
      token: pendingToken,
      method: params.get('method') ?? 'totp',
    });
    setTwoFactorCode('');
    setTwoFactorError(null);
    setTwoFactorLoading(false);

    if (params.get('source') === 'google') {
      enqueueSnackbar({
        message: 'Enter the code from your authenticator to finish Google sign-in.',
        variant: 'info',
      });
    }

    navigate('/login', { replace: true });
  }, [location.search, navigate, enqueueSnackbar]);

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
        enqueueSnackbar({
          message: 'Logged in',
          variant: 'success',
        });
        return;
      }

      if (res.data?.twoFactorRequired) {
        setTwoFactorPending({
          token: res.data.pendingToken as string,
          method: (res.data.method as string) || 'totp',
        });
        enqueueSnackbar({
          message: 'Enter your authentication code to finish logging in.',
          variant: 'info',
        });
        return;
      }

      throw new Error('Invalid server response');
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(axiosErr?.response?.data?.message ?? err?.message ?? 'Login failed'),
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorPending) return;
    if (!twoFactorCode.trim()) {
      setTwoFactorError('Please enter the authentication code');
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
      enqueueSnackbar({
        message: '2FA confirmed, welcome back!',
        variant: 'success',
      });
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
    <div className="min-h-screen bg-slate-950">
      <Navbar />
      <div className="relative min-h-[calc(100vh-6rem)] pt-28 pb-16 text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-indigo-600/40 via-purple-500/10 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 top-40 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="absolute bottom-24 right-12 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:px-12">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">
              Welcome back
            </span>
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl md:text-5xl">
              Sign in to continue your arcade journey.
            </h1>
            <p className="max-w-xl text-base text-slate-200/80 sm:text-lg">
              Log in to challenge friends, manage your profile.
              Your games, stats, and security settings stay in sync across devices.
            </p>
            <ul className="space-y-3 text-sm text-slate-300/80 sm:text-base">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white">
                    •
                  </span>
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative w-full max-w-md justify-self-center">
            <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-500 opacity-50 blur" />
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 px-6 py-8 shadow-xl shadow-indigo-950/40 backdrop-blur">
              <div className="absolute -top-8 right-0 h-24 w-24 rounded-full bg-indigo-500/10 blur-2xl" />
              <div className="absolute -bottom-12 left-12 h-28 w-28 rounded-full bg-purple-500/10 blur-2xl" />

              <div className="relative">
                <h2 className="mb-2 text-center text-2xl font-semibold">Log in</h2>
                <p className="mb-6 text-center text-sm text-slate-300/80">
                  Use your email and password or finish two-factor verification to enter the arcade.
                </p>

                {!twoFactorPending ? (
                  <>
                    <AuthForm type="login" onSubmit={handleLogin} />
                    {loading && (
                      <p className="mt-3 text-sm text-indigo-200/80">Authenticating…</p>
                    )}
                  </>
                ) : (
                  <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
                    <p className="text-sm text-slate-200/80">
                      Two-factor authentication is enabled. Enter the code from your authenticator app
                      to continue.
                    </p>
                    <label className="block text-sm font-medium text-slate-200" htmlFor="twoFactorCode">
                      Authentication code
                    </label>
                    <input
                      id="twoFactorCode"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      className="w-full rounded border border-indigo-500/40 bg-white/95 px-3 py-2 text-slate-900"
                      value={twoFactorCode}
                      onChange={(event) => setTwoFactorCode(event.target.value)}
                    />
                    {twoFactorError && (
                      <p className="text-sm font-medium text-rose-400">{twoFactorError}</p>
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        className="flex-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-2 text-sm font-semibold text-white shadow shadow-indigo-900/40 transition hover:from-indigo-400 hover:to-purple-400"
                        disabled={twoFactorLoading}
                      >
                        {twoFactorLoading ? 'Verifying…' : 'Verify code'}
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-indigo-400/40 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:border-indigo-300 hover:text-white"
                        onClick={resetTwoFactorState}
                        disabled={twoFactorLoading}
                      >
                        Back
                      </button>
                    </div>
                  </form>
                )}

                <p className="mt-6 text-center text-sm text-slate-300/80">
                  Don&apos;t have an account yet?
                  <Link
                    to="/signup"
                    className="ml-2 font-semibold text-indigo-300 transition hover:text-white"
                  >
                    Create one →
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
