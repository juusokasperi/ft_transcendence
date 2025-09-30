import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { AxiosError } from 'axios';
import { useSnackbar } from '../context/SnackbarContext';

const ConfirmEmail = () => {
  const { token } = useParams();
  const { axios, setUser, navigate } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();
  const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');

  useEffect(() => {
    const confirmEmail = async () => {
      try {
        await axios.post(`/api/users/confirm-email/${token}`);

        setStatus('success');
        enqueueSnackbar({
          message: 'Email successfully updated!',
          variant: 'success',
        });
        setTimeout(() => navigate('/profile'), 1500);
      } catch (err) {
        setStatus('error');
        const axiosErr = err as AxiosError<{ message?: string }>;
        enqueueSnackbar({
          message: String(axiosErr?.response?.data?.message ?? 'Email confirmation failed'),
          variant: 'error',
        });
      }
    };

    if (token) {
      confirmEmail();
    }
  }, [token, axios, setUser, navigate, enqueueSnackbar]);

  return (
    <div className="flex h-screen items-center justify-center">
      {status === 'validating' && <p>Confirming your new email...</p>}
      {status === 'success' && <p>Email updated successfully! Redirecting...</p>}
      {status === 'error' && <p>Invalid or expired confirmation link.</p>}
    </div>
  );
};

export default ConfirmEmail;
