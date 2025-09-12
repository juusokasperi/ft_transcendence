import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

const Layout: React.FC = () => {
  const { user, navigate } = useAppContext();

  useEffect(() => {
    if (!user) {
      navigate('/');
    }
  }, [user]);

  return (
    <div className="flex h-screen flex-col">
      <Navbar />
      <div className="flex h-full">
        <Sidebar />
        <div className="h-full flex-1 p-4 pt-10 md:px-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
