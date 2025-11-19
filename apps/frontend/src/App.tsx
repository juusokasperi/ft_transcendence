import React, { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { lazy } from 'react';
import Registration from './pages/Registration';
import Login from './pages/Login';
import Home from './pages/Home';
import Layout from './pages/Layout';
import Profile from './pages/Profile';
import Friends from './pages/Friends';
import Stats from './pages/Stats';
import Confirmation from './pages/Confirmation';
import DeleteUser from './pages/DeleteUser';
import ConfirmEmail from './pages/ConfirmEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PublicUser from './pages/PublicUser';
import NotFound from './pages/NotFound';

import Chat from './components/Chat';
import ChatToggleButton from './components/chat/ChatToggleButton';
import { SidebarProvider } from './context/SidebarContext';
import { SnackbarProvider } from './context/SnackbarContext';
import { useAppContext } from './context/AppContext';
import { ChatProvider } from './context/ChatContext';
import { RealtimeSocketProvider } from './context/RealtimeSocketContext';
import { PresenceProvider } from './context/PresenceContext';
import { useMatchActivity } from './context/MatchActivityContext';

import PongLayout from './pages/pong/PongLayout';
const ModePicker = lazy(() => import('./pages/pong/ModePicker'));
const LocalGame = lazy(() => import('./pages/pong/local/LocalGame'));
const OnlineGame = lazy(() => import('./pages/pong/online/OnlineGame'));
const Tournament = lazy(() => import('./pages/pong/tournament/TournamentPage'));
const TournamentDetail = lazy(() => import('./pages/pong/tournament/TournamentDetail'));

function App() {
  const { user } = useAppContext();
  const [chatOpen, setChatOpen] = useState(false);
  const matchActive = useMatchActivity();

  const channel = 'Lobby';
  const chatUiEnabled = Boolean(user && !matchActive);

  useEffect(() => {
    if (!chatUiEnabled && chatOpen) {
      setChatOpen(false);
    }
  }, [chatOpen, chatUiEnabled]);

  return (
    <SidebarProvider>
      <SnackbarProvider>
        <RealtimeSocketProvider>
          <PresenceProvider>
            <div>
              {chatUiEnabled && (
                <ChatProvider channel={channel}>
                  <>
                    {!chatOpen && <ChatToggleButton open={chatOpen} setOpen={setChatOpen} />}
                    <Chat onClose={() => setChatOpen(false)} channel={channel} isOpen={chatOpen} />
                  </>
                </ChatProvider>
              )}
              {/* Routes */}
              <Routes>
                <Route path={'/'} element={<Home />} />
                <Route path={'/signup'} element={<Registration />} />
                <Route path={'/login'} element={<Login />} />
                <Route path={'/forgot-password'} element={<ForgotPassword />} />
                <Route path={'/reset-password/:token'} element={<ResetPassword />} />
                <Route path="/pong" element={<PongLayout />}>
                  <Route index element={<ModePicker />} />
                  <Route path="local" element={<LocalGame />} />
                  <Route path="online" element={<OnlineGame />} />
                  <Route path="tournaments" element={<Tournament />} />
                  <Route path="tournaments/:tournamentId" element={<TournamentDetail />} />
                </Route>
                <Route path={'/confirm/:confirmationToken'} element={<Confirmation />} />
                <Route path={'/delete-user/:confirmationToken'} element={<DeleteUser />} />
                <Route path={'/confirm-email/:token'} element={<ConfirmEmail />} />
                <Route path={'/profile'} element={<Layout />}>
                  <Route index element={<Profile />} />
                  <Route path={'stats'} element={<Stats />} />
                  <Route path={'friends'} element={<Friends />} />
                </Route>
                <Route path={'/users/:uuid'} element={<PublicUser />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </PresenceProvider>
        </RealtimeSocketProvider>
      </SnackbarProvider>
    </SidebarProvider>
  );
}

export default App;
