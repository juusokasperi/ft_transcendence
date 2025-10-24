import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { AxiosError } from 'axios';
import { useSnackbar } from '../context/SnackbarContext';

const DeleteUser = () => {
  const { confirmationToken } = useParams();
  const { axios, setUser, navigate } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();
  const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');

  useEffect(() => {
    const confirmAccount = async () => {
      try {
        await axios.post(`/api/users/me/confirm-delete/${confirmationToken}`, {
          token: confirmationToken,
        });

        setStatus('success');
        setUser(null);
        enqueueSnackbar({
          message: 'Account deleted. We hope to see you again!',
          variant: 'success',
        });
        setTimeout(() => navigate('/'), 1500);
      } catch (err) {
        setStatus('error');
        const axiosErr = err as AxiosError<{ message?: string }>;
        enqueueSnackbar({
          message: String(axiosErr?.response?.data?.message ?? 'Delete confirmation failed'),
          variant: 'error',
        });
      }
    };

    if (confirmationToken) {
      confirmAccount();
    }
  }, [confirmationToken, axios, setUser, navigate, enqueueSnackbar]);

  return (
    <div className="flex h-screen items-center justify-center">
      {status === 'validating' && <p>Deleting your account...</p>}
      {status === 'success' && <p>Account deleted! Redirecting...</p>}
      {status === 'error' && <p>Invalid or expired confirmation link.</p>}
    </div>
  );
};

export default DeleteUser;
