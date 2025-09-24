import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
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
    <>
      <Navbar />
      <div className="flex min-h-screen bg-slate-950">
        <Sidebar />
        <div className="flex-1 px-4 pb-10 pt-24 md:px-10">
          <Outlet />
        </div>
      </div>
    </>
  );
};

export default Layout;
