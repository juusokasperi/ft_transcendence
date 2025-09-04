import Navbar from './components/Navbar';
import { Route, Routes } from 'react-router-dom';
import Registration from './pages/Registation';
import Login from './pages/Login';
import Home from './pages/Home';
import Layout from './pages/Layout';
import Profile from './pages/Profile';
import { Toaster } from 'react-hot-toast';
import Friends from './pages/Friends';
import { useAppContext } from './context/AppContext';
import { useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import Confirmation from './pages/Confirmation';

function App() {
  return (
    <div>
      <Toaster />
      <Navbar />

      <Routes>
        <Route path={'/'} element={<Home />} />
        <Route path={'/signup'} element={<Registration />} />
        <Route path={'/login'} element={<Login />} />
        <Route path={'/confirm/:confirmationToken'} element={<Confirmation />} />
        <Route path={'/profile'} element={<Layout />}>
          <Route index element={<Profile />} />
          <Route path={'/profile/friends'} element={<Friends />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
