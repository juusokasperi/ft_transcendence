import React, { useState } from "react";
import AuthForm from "../components/AuthForm";
import { useAppContext } from "../context/AppContext";
import type { User } from "../types";
import { toast } from "react-hot-toast";
import type { AxiosError } from "axios";

const Login: React.FC = () => {
  const { axios, login, navigate } = useAppContext();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (data: { username: string; password: string }) => {
    setLoading(true);
    try {
      // POST to /api/login (no Authorization header expected)
      const res = await axios.post("/api/login", {
        username: data.username,
        password: data.password,
      });

      // adapt to your backend response shape
      const { token, user } = res.data as { token: string; user: User };

      if (!token || !user) throw new Error("Invalid server response");
      console.log("LOGGED IN!!");

      // set auth in context (AppContext should expose login)
      login(user, token);

      toast.success("Logged in");
      navigate("/"); // redirect to home / dashboard
    } catch (err: any) {
      const axiosErr = err as AxiosError;
      const message =
        axiosErr?.response?.data?.message || axiosErr?.message || "Login failed";
      toast.error(String(message));
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
      </div>
    </div>
  );
};

export default Login;
