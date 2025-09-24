import React, { useEffect, useState } from 'react';
import AuthForm from '../components/AuthForm';
import { useAppContext } from '../context/AppContext';
import { toast } from 'react-hot-toast';
import type { AxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import { Link } from 'react-router-dom';

const highlights = [
  'Reserve your arcade handle before tournaments open',
  'Sync stats and cosmetics across every device',
  'Built-in security with multi-factor protection',
];

const Registration: React.FC = () => {
  const { axios, navigate, user } = useAppContext();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleRegister = async (data: {
    username?: string;
    email: string;
    password: string;
    confirmPassword?: string;
  }) => {
    setLoading(true);
    try {
      // POST to /api/signup
      const res = await axios.post('/api/signup', {
        username: data.username,
        email: data.email,
        password: data.password,
      });

      console.log(res.data.success);
      const axiosRes = res as AxiosResponse<{ success?: string }>;
      const msg = axiosRes.data.success;
      toast.success(String(msg));
      navigate('/login');
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      const msg = axiosErr?.response?.data?.message;
      console.log(axiosErr);
      toast.error(String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="relative min-h-[calc(100vh-6rem)] pt-28 pb-16 text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-purple-600/40 via-indigo-500/10 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-20 top-48 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="absolute bottom-16 right-8 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:px-12">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">
              Join the arcade
            </span>
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl md:text-5xl">
              Claim your spot and start climbing the leaderboard.
            </h1>
            <p className="max-w-xl text-base text-slate-200/80 sm:text-lg">
              Create an account to unlock competitive matchmaking, track progress across every title,
              and secure rewards for upcoming seasons.
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
                <h2 className="mb-2 text-center text-2xl font-semibold">Create your account</h2>
                <p className="mb-6 text-center text-sm text-slate-300/80">
                  Choose a unique handle and secure your profile for every arcade game.
                </p>

                <AuthForm type="register" onSubmit={handleRegister} />
                {loading && <p className="mt-3 text-sm text-indigo-200/80">Creating account…</p>}

                <p className="mt-6 text-center text-sm text-slate-300/80">
                  Already have an account?
                  <Link
                    to="/login"
                    className="ml-2 font-semibold text-indigo-300 transition hover:text-white"
                  >
                    Sign in →
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

export default Registration;
