import Navbar from './components/Navbar';
import { Route, Routes } from 'react-router-dom';
import Registration from './pages/Registration';
import Login from './pages/Login';
import Home from './pages/Home';
import Layout from './pages/Layout';
import Profile from './pages/Profile';
import { Toaster } from 'react-hot-toast';
import Friends from './pages/Friends';
import Confirmation from './pages/Confirmation';
import PingPong from './pages/PingPong/PingPong';
import LocalGame from './pages/PingPong/LocalGame';
import DeleteUser from './pages/DeleteUser';

function App() {
  return (
    <div>
      <Toaster />
      <Navbar />

      <Routes>
        <Route path={'/'} element={<Home />} />
        <Route path={'/signup'} element={<Registration />} />
        <Route path={'/login'} element={<Login />} />
        <Route path={'/ping-pong'} element={<PingPong />} />
        <Route path={'/ping-pong/local'} element={<LocalGame />} />
        <Route path={'/confirm/:confirmationToken'} element={<Confirmation />} />
        <Route path={'/delete-user/:confirmationToken'} element={<DeleteUser />} />
        <Route path={'/profile'} element={<Layout />}>
          <Route index element={<Profile />} />
          <Route path={'/profile/friends'} element={<Friends />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
