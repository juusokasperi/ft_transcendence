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

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleLogin = async (data: { email: string; password: string }) => {
    setLoading(true);
    try {
      const res = await axios.post('/api/login', {
        email: data.email,
        password: data.password,
      });

      const { user: loggedIn } = res.data as { user: User };
      if (!loggedIn) throw new Error('Invalid server response');

      login(loggedIn);

      toast.success('Logged in');
      // navigate('/') is optional; your useEffect will redirect once user is set
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      toast.error(String(axiosErr?.response?.data?.message || 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold">Login</h1>
        <AuthForm type="login" onSubmit={handleLogin} />
        {loading && <p className="mt-2 text-sm">Authenticating…</p>}
        <span className="text-gray-600">Don't have an account yet?</span>
        <Link to="/signup" className="ml-2 text-blue-700">
          Sign Up
        </Link>
      </div>
    </div>
  );
};

export default Login;
