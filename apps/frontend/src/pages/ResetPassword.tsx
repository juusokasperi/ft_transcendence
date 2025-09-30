import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Button from '../components/Button';
import { validatePassword } from '../utils/validation';
import { useAppContext } from '../context/AppContext';
import { useSnackbar } from '../context/SnackbarContext';

const ResetPassword: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { axios } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setError('Reset token is missing or invalid.');
    }
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || loading) return;

    setError(null);
    setSuccess(null);

    const { state, msg } = validatePassword(password);
    if (state !== 'valid') {
      setError(msg || 'Choose a stronger password.');
      return;
    }

    if (!confirmPassword.trim() || password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`/api/reset-password/${token}`, { newPassword: password });
      setSuccess('Password updated successfully. Redirecting to login…');
      enqueueSnackbar({
        message: 'Password reset complete. Please sign in with your new password.',
        variant: 'success',
      });
      redirectTimer.current = setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError('Token is invalid or expired. Request a new reset email.');
      enqueueSnackbar({
        message: 'Password reset failed. Please request a new link.',
        variant: 'error',
      });
    } finally {
      setLoading(false);
      setPassword('');
      setConfirmPassword('');
    }
  };

  const validation = validatePassword(password);
  const borderColor = !password
    ? 'border-white/15'
    : validation.state === 'valid'
      ? 'border-emerald-400'
      : validation.state === 'weak'
        ? 'border-amber-400'
        : 'border-rose-400';

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />
      <div className="relative min-h-[calc(100vh-6rem)] pb-16 pt-28">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-purple-500/40 via-indigo-500/10 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-28 top-52 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="absolute bottom-14 right-16 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center gap-10 px-4 text-center sm:px-6 lg:px-12">
          <div className="max-w-xl space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-purple-200">
              Choose new password
            </span>
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
              Set a fresh password to get back into the arcade.
            </h1>
            <p className="text-base text-slate-200/80 sm:text-lg">
              Strong passwords keep your progress secure. Make sure to remember the new one or store
              it in a password manager.
            </p>
          </div>

          <div className="relative w-full max-w-md">
            <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 opacity-40 blur" />
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/85 px-6 py-8 shadow-xl shadow-indigo-950/40 backdrop-blur">
              <div className="absolute -top-8 right-0 h-24 w-24 rounded-full bg-indigo-500/10 blur-2xl" />
              <div className="absolute -bottom-12 left-12 h-28 w-28 rounded-full bg-purple-500/10 blur-2xl" />

              <form onSubmit={handleSubmit} className="relative space-y-5 text-left">
                <div>
                  <label
                    htmlFor="newPassword"
                    className="mb-1 block text-sm font-semibold text-slate-200"
                  >
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className={`w-full rounded-xl border ${borderColor} bg-white/95 px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40`}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter a strong password"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-3 text-sm font-semibold text-purple-600 transition hover:text-purple-500"
                      disabled={loading}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {validation.msg && (
                    <p className="mt-1 text-sm text-amber-200/80">{validation.msg}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="mb-1 block text-sm font-semibold text-slate-200"
                  >
                    Confirm new password
                  </label>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className={`w-full rounded-xl border ${
                      confirmPassword && password !== confirmPassword
                        ? 'border-rose-400'
                        : 'border-white/15'
                    } bg-white/95 px-3 py-2 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40`}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter the password"
                    disabled={loading}
                  />
                </div>

                {error && <p className="text-sm font-medium text-rose-300">{error}</p>}
                {success && <p className="text-sm font-medium text-emerald-300">{success}</p>}

                <Button type="submit" fullWidth disabled={loading || !token}>
                  {loading ? 'Updating password…' : 'Update password'}
                </Button>

                <p className="text-sm text-slate-300/80">
                  Token expired?{' '}
                  <Link
                    to="/forgot-password"
                    className="font-semibold text-purple-200 transition hover:text-white"
                  >
                    Request a new reset email
                  </Link>
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
