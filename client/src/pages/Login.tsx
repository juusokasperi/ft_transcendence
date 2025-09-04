import React, { useState } from 'react';
import AuthForm from '../components/AuthForm';
import { useAppContext } from '../context/AppContext';
import type { User } from '../types';
import { toast } from 'react-hot-toast';
import type { AxiosError } from 'axios';
import { Link } from 'react-router-dom';

const Login: React.FC = () => {
  const { axios, login, navigate } = useAppContext();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (data: { email: string; password: string }) => {
    setLoading(true);
    try {
      // POST to /api/login (no Authorization header expected)
      const res = await axios.post('/api/login', {
        email: data.email,
        password: data.password,
      });

      const { token, user } = res.data as { token: string; user: User };

      if (!token || !user) throw new Error('Invalid server response');
      console.log('LOGGED IN!!');

      login(user, token);

      toast.success('Logged in');
      navigate('/'); // redirect to home
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      const msg = axiosErr?.response?.data?.message;
      console.log(msg);
      toast.error(String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>
        <AuthForm type="login" onSubmit={handleLogin} />
        {loading && <p className="mt-2 text-sm">Authenticating…</p>}
        <span className="text-gray-600 ">Don't have an account yet?</span>
        <Link to="/signup" className="text-blue-700 ml-2">
          Sign Up
        </Link>
      </div>
    </div>
  );
};

export default Login;
