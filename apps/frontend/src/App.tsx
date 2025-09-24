import Navbar from './components/Navbar';
import { Route, Routes } from 'react-router-dom';
import Registration from './pages/Registration';
import Login from './pages/Login';
import Home from './pages/Home';
import Layout from './pages/Layout';
import Profile from './pages/Profile';
import { Toaster } from 'react-hot-toast';
import Friends from './pages/Friends';
import Stats from './pages/Stats';
import Confirmation from './pages/Confirmation';
import PingPong from './pages/pong/pong-homepage';
import LocalGame from './pages/pong/local-game';
import DeleteUser from './pages/DeleteUser';
import OnlineGame from './pages/pong/online-game';
import { SidebarProvider } from './context/SidebarContext';

function App() {
  return (
    <SidebarProvider>
      <div>
        <Toaster />
        <Navbar />

        <Routes>
          <Route path={'/'} element={<Home />} />
          <Route path={'/signup'} element={<Registration />} />
          <Route path={'/login'} element={<Login />} />
          <Route path={'/ping-pong'} element={<PingPong />} />
          <Route path={'/ping-pong/local'} element={<LocalGame />} />
          <Route path={'/ping-pong/online'} element={<OnlineGame />} />
          <Route path={'/confirm/:confirmationToken'} element={<Confirmation />} />
          <Route path={'/delete-user/:confirmationToken'} element={<DeleteUser />} />
          <Route path={'/profile'} element={<Layout />}>
            <Route index element={<Profile />} />
            <Route path={'/profile/stats'} element={<Stats />} />
            <Route path={'/profile/friends'} element={<Friends />} />
          </Route>
        </Routes>
      </div>
    </SidebarProvider>
  );
}

export default App;
