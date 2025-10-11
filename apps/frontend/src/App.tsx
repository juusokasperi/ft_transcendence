import React, { useMemo, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import Registration from "./pages/Registration";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Layout from "./pages/Layout";
import Profile from "./pages/Profile";
import Friends from "./pages/Friends";
import Stats from "./pages/Stats";
import Confirmation from "./pages/Confirmation";
import PingPong from "./pages/pong/pong-homepage";
import LocalGame from "./pages/pong/local/local-game";
import DeleteUser from "./pages/DeleteUser";
import ConfirmEmail from "./pages/ConfirmEmail";
import OnlineGame from "./pages/pong/online-game";
import Tournament from "./pages/pong/tournament";
import TournamentDetail from "./pages/pong/tournament-detail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import PublicUser from "./pages/PublicUser";

import Chat from "./components/Chat";
import { SidebarProvider } from "./context/SidebarContext";
import { SnackbarProvider } from "./context/SnackbarContext";

/**
 * Map pathname to chat channel.
 * Important: /profile* always maps to 'lobby' (per your request).
 */
function computeChannelFromPath(pathname: string) {
  // Home
  if (pathname === "/") return "lobby";

  // Force logged-in profile pages to use lobby channel
  if (pathname.startsWith("/profile")) return "lobby";

  // Ping-pong area
  if (pathname.startsWith("/ping-pong/online")) return "matchmaking";
  if (pathname.startsWith("/ping-pong")) return "ping-pong";

  return "lobby";
}

function ChatToggleButton({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <button
      onClick={() => setOpen(!open)}
      aria-label="Toggle chat"
      className="fixed right-6 bottom-6 z-60 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600/90 text-white shadow-lg hover:bg-indigo-500"
      title={open ? "Close chat" : "Open chat"}
    >
      💬
    </button>
  );
}

function App() {
  const location = useLocation();
  const [chatOpen, setChatOpen] = useState(true);

  // compute channel whenever location changes
  const channel = useMemo(() => computeChannelFromPath(location.pathname), [location.pathname]);

  return (
    <SidebarProvider>
      <SnackbarProvider>
        <div>
      {/* Floating toggle so user can open/close chat — only show when chat is CLOSED */}
      {!chatOpen && <ChatToggleButton open={chatOpen} setOpen={setChatOpen} />}

      {/* Mount Chat only when chatOpen is true */}
      {chatOpen && (
        <Chat
          onClose={() => setChatOpen(false)}
          channel={channel}
          defaultOpen={true}
        />
      )}
          {/* Routes */}
          <Routes>
            <Route path={"/"} element={<Home />} />
            <Route path={"/signup"} element={<Registration />} />
            <Route path={"/login"} element={<Login />} />
            <Route path={"/forgot-password"} element={<ForgotPassword />} />
            <Route path={"/reset-password/:token"} element={<ResetPassword />} />
            <Route path={"/ping-pong"} element={<PingPong />} />
            <Route path={"/ping-pong/local"} element={<LocalGame />} />
            <Route path={"/ping-pong/online"} element={<OnlineGame />} />
            <Route path={"/ping-pong/tournaments"} element={<Tournament />} />
            <Route path={"/ping-pong/tournaments/:tournamentId"} element={<TournamentDetail />} />
            <Route path={"/confirm/:confirmationToken"} element={<Confirmation />} />
            <Route path={"/delete-user/:confirmationToken"} element={<DeleteUser />} />
            <Route path={"/confirm-email/:token"} element={<ConfirmEmail />} />
            <Route path={"/profile"} element={<Layout />}>
              <Route index element={<Profile />} />
              <Route path={"stats"} element={<Stats />} />
              <Route path={"friends"} element={<Friends />} />
            </Route>
            <Route path={"/users/:uuid"} element={<PublicUser />} />
          </Routes>
        </div>
      </SnackbarProvider>
    </SidebarProvider>
  );
}

export default App;
