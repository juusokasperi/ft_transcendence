import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Button from '../components/Button';
import { validateEmail } from '../utils/validation';
import { useAppContext } from '../context/AppContext';
import { useSnackbar } from '../context/SnackbarContext';

const ForgotPassword: React.FC = () => {
  const { axios, user, navigate } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim()) {
      setError('Enter the email linked to your account.');
      return;
    }
    if (!validateEmail(email.trim())) {
      setError('Provide a valid email.');
      return;
    }

    setLoading(true);
    try {
      await axios.post('/api/reset-password', { email: email.trim() });
      setSuccess('If the address is registered, a reset link is on the way.');
      enqueueSnackbar({
        message: 'Check your inbox for password reset instructions.',
        variant: 'info',
      });
    } catch (err) {
      setError('We could not send the reset email. Please try again shortly.');
      enqueueSnackbar({
        message: 'Failed to trigger password reset.',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />
      <div className="relative min-h-[calc(100vh-6rem)] pb-16 pt-28">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-sky-500/40 via-indigo-500/10 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 top-48 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="absolute bottom-16 right-12 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center gap-10 px-4 text-center sm:px-6 lg:px-12">
          <div className="max-w-xl space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
              Reset password
            </span>
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
              We will send a reset link to your inbox.
            </h1>
            <p className="text-base text-slate-200/80 sm:text-lg">
              Enter the email you use to sign in. For security, we will only confirm whether the
              message was sent, not if the email exists in our system.
            </p>
          </div>

          <div className="relative w-full max-w-md">
            <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-sky-500 via-indigo-500 to-purple-500 opacity-40 blur" />
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/85 px-6 py-8 shadow-xl shadow-indigo-950/40 backdrop-blur">
              <div className="absolute -top-8 right-0 h-24 w-24 rounded-full bg-indigo-500/10 blur-2xl" />
              <div className="absolute -bottom-12 left-12 h-28 w-28 rounded-full bg-sky-500/10 blur-2xl" />

              <form onSubmit={handleSubmit} className="relative space-y-5 text-left">
                <div>
                  <label
                    htmlFor="resetEmail"
                    className="mb-1 block text-sm font-semibold text-slate-200"
                  >
                    Email address
                  </label>
                  <input
                    id="resetEmail"
                    type="email"
                    autoComplete="email"
                    className="w-full rounded-xl border border-white/15 bg-white/95 px-3 py-2 text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    disabled={loading}
                  />
                </div>

                {error && <p className="text-sm font-medium text-rose-300">{error}</p>}
                {success && <p className="text-sm font-medium text-emerald-300">{success}</p>}

                <Button type="submit" fullWidth disabled={loading}>
                  {loading ? 'Sending link…' : 'Send reset link'}
                </Button>

                <p className="text-sm text-slate-300/80">
                  Remembered your password?{' '}
                  <Link
                    to="/login"
                    className="font-semibold text-sky-200 transition hover:text-white"
                  >
                    Back to login
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

export default ForgotPassword;
