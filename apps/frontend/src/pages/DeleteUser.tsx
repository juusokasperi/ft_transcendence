import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';
import { AxiosError } from 'axios';

const DeleteUser = () => {
  const { confirmationToken } = useParams();
  const { axios, setUser, navigate } = useAppContext();
  const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');

  useEffect(() => {
    const confirmAccount = async () => {
      try {
        console.log(confirmationToken);
        await axios.post(`/api/users/me/confirm-delete/${confirmationToken}`, {
          token: confirmationToken,
        });

        setStatus('success');
        setUser(null);
        setTimeout(() => navigate('/'), 1500);
      } catch (err) {
        console.error(err);
        setStatus('error');
        const axiosErr = err as AxiosError<{ message?: string }>;
        toast.error(String(axiosErr?.response?.data?.message));
      }
    };

    if (confirmationToken) {
      confirmAccount();
    }
  }, [confirmationToken, axios, setUser, navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      {status === 'validating' && <p>Deleting your account...</p>}
      {status === 'success' && <p>Account deleted! Redirecting...</p>}
      {status === 'error' && <p>Invalid or expired confirmation link.</p>}
    </div>
  );
};

export default DeleteUser;
