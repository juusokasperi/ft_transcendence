import React, { useState } from "react";
import AuthForm from "../components/AuthForm";
import { useAppContext } from "../context/AppContext";
import type { User } from "../types";
import { toast } from "react-hot-toast";
import type { AxiosError } from "axios";
import type { AxiosResponse } from "axios";

const Registration: React.FC = () => {
  const { axios, login, navigate } = useAppContext();
  const [loading, setLoading] = useState(false);

  const handleRegister = async (data: { username?: string; email: string; password: string; confirmPassword?: string }) => {
    setLoading(true);
    try {
      // POST to /api/signup
      const res = await axios.post("/api/signup", {
        username: data.username,
        email: data.email,
        password: data.password,
      });

      // If your server returns a token + user, you can auto-login:
      const { token, user } = res.data as { token?: string; user?: User };

      if (token && user) {
        login(user, token);
        toast.success("Account created and logged in");
        navigate("/");
        return;
      }

      // if server doesn't return token, fall back to showing success and asking user to login
      console.log(res.data.success)
      const axiosRes =  res as AxiosResponse<{success?:string}>;
      const msg = axiosRes.data.success;
      toast.success(String(msg));
      navigate("/login");
    } catch (err: any) {
      const axiosErr = err as AxiosError<{message?:string}>;
      const msg = axiosErr?.response?.data?.message;
      console.log(axiosErr)
      toast.error(String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Register</h1>
        <AuthForm type="register" onSubmit={handleRegister} />
        {loading && <p className="mt-2 text-sm">Creating account…</p>}
      </div>
    </div>
  );
};

export default Registration;
