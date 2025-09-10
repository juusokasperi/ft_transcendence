import Cookies from 'js-cookie';
import axios from 'axios';

export const useAuth = () => {
  const getToken = () => Cookies.get('token') || null;

  const setAuth = (t: string | null) => {
    if (t) axios.defaults.headers.common.Authorization = `Bearer ${t}`;
    else delete axios.defaults.headers.common.Authorization;
  };

  const initAuth = () => setAuth(getToken());
  const login = (token: string) => {
    Cookies.set('token', token, { expires: 7, sameSite: 'Strict' });
    setAuth(token);
  };
  const logout = () => {
    Cookies.remove('token');
    setAuth(null);
  };

  return { getToken, initAuth, login, logout };
};
