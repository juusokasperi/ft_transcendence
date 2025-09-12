import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

const Confirmation = () => {
  const { confirmationToken } = useParams();
  const { axios, navigate } = useAppContext();
  const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');

  useEffect(() => {
    const confirmAccount = async () => {
      try {
        console.log(confirmationToken);
        await axios.post(`/api/signup/validate/${confirmationToken}`);

        setStatus('success');

        // Redirect after a short delay
        setTimeout(() => navigate('/login'), 1500);
      } catch (error) {
        console.error(error);
        setStatus('error');
      }
    };

    if (confirmationToken) {
      confirmAccount();
    }
  }, [confirmationToken, axios, navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      {status === 'validating' && <p>Validating your account...</p>}
      {status === 'success' && <p>Account confirmed! Redirecting...</p>}
      {status === 'error' && <p>Invalid or expired confirmation link.</p>}
    </div>
  );
};

export default Confirmation;
