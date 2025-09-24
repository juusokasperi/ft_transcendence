import Sidebar from '../components/Sidebar';
import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

const Layout: React.FC = () => {
  const { user, navigate, userReady } = useAppContext();

  useEffect(() => {
    if (userReady && !user) {
      navigate('/');
    }
  }, [user, userReady, navigate]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="h-full flex-1 pt-22">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
