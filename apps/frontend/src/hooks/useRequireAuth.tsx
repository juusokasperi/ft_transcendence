import { useAppContext } from '../context/AppContext';
import { useEffect } from 'react';

export function useRequireAuth() {
  const { user, userReady, navigate } = useAppContext();
  useEffect(() => {
    if (userReady && !user) {
      navigate('/');
    }
  }, [user, userReady, navigate]);
}
