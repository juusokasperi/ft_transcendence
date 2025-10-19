import { Route, Routes } from 'react-router-dom';
import Registration from './pages/Registration';
import Login from './pages/Login';
import Home from './pages/Home';
import Layout from './pages/Layout';
import Profile from './pages/Profile';
import Friends from './pages/Friends';
import Stats from './pages/Stats';
import Confirmation from './pages/Confirmation';
import PingPong from './pages/pong/pong-homepage';
import LocalGame from './pages/pong/local/local-game';
import DeleteUser from './pages/DeleteUser';
import ConfirmEmail from './pages/ConfirmEmail';
import OnlineGame from './pages/pong/online/online-game';
import Tournament from './pages/pong/tournament/tournament-page';
import TournamentDetail from './pages/pong/tournament/tournament-detail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PublicUser from './pages/PublicUser';
import { SidebarProvider } from './context/SidebarContext';
import { SnackbarProvider } from './context/SnackbarContext';

function App() {
  return (
    <SidebarProvider>
      <SnackbarProvider>
        <div>
          <Routes>
            <Route path={'/'} element={<Home />} />
            <Route path={'/signup'} element={<Registration />} />
            <Route path={'/login'} element={<Login />} />
            <Route path={'/forgot-password'} element={<ForgotPassword />} />
            <Route path={'/reset-password/:token'} element={<ResetPassword />} />
            <Route path={'/pong3d'} element={<PingPong />} />
              <Route path={'/pong3d/local'} element={<LocalGame />} />
              <Route path={'/pong3d/online'} element={<OnlineGame />} />
              <Route path={'/pong3d/tournaments'} element={<Tournament />} />
              <Route path={'/pong3d/tournaments/:tournamentId'} element={<TournamentDetail />} />
            <Route path={'/confirm/:confirmationToken'} element={<Confirmation />} />
            <Route path={'/delete-user/:confirmationToken'} element={<DeleteUser />} />
            <Route path={'/confirm-email/:token'} element={<ConfirmEmail />} />
            <Route path={'/profile'} element={<Layout />}>
              <Route index element={<Profile />} />
              <Route path={'/profile/stats'} element={<Stats />} />
              <Route path={'/profile/friends'} element={<Friends />} />
            </Route>
            <Route path={'/users/:uuid'} element={<PublicUser />} />
          </Routes>
        </div>
      </SnackbarProvider>
    </SidebarProvider>
  );
}

export default App;
