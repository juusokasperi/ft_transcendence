import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useSidebar } from '../context/SidebarContext';
import { FiMenu, FiX } from 'react-icons/fi';

const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'Pong', to: '/ping-pong' },
];

const Navbar = () => {
  const { user, logout } = useAppContext();
  const location = useLocation();
  const { isOpen: sidebarOpen, toggle: toggleSidebar, close: closeSidebar } = useSidebar();
  const onProfileRoute = location.pathname.startsWith('/profile');

  useEffect(() => {
    if (!onProfileRoute) {
      closeSidebar();
    }
  }, [onProfileRoute, closeSidebar]);

  return (
    <nav
      data-app-navbar
      className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-slate-950/80 text-white shadow-[0_10px_30px_-20px_rgba(67,56,202,0.75)] backdrop-blur-xl"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-4 py-5 sm:px-6 lg:px-12">
        <Link to="/" className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-500">
            <img src="/src/assets/logo.png" alt="Arcade home" className="h-9 w-9" />
          </span>
          <span className="hidden text-lg font-semibold tracking-wide text-indigo-100 sm:inline">
            Arcade Transcendence
          </span>
        </Link>

        <div className="hidden items-center gap-6 text-sm font-medium text-slate-200/80 md:flex">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`relative transition hover:text-white ${
                  isActive ? 'text-white' : ''
                }`}
              >
                {link.label}
                {isActive && (
                  <span className="absolute -bottom-2 left-0 h-[2px] w-full bg-gradient-to-r from-indigo-400 to-purple-400" />
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {onProfileRoute && (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Toggle profile navigation"
              aria-controls="profile-sidebar"
              aria-expanded={sidebarOpen}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-indigo-500/70 text-white shadow-lg shadow-indigo-900/40 backdrop-blur-md transition hover:bg-indigo-400/70 md:hidden"
            >
              {sidebarOpen ? <FiX size={22} /> : <FiMenu size={22} />}
            </button>
          )}

          {user ? (
            <>
              <span className="hidden text-sm font-medium text-indigo-200 sm:inline">
                Welcome {user.username} ✨
              </span>
              <Link
                to="/profile"
                className="hidden items-center justify-center rounded-full border border-indigo-400/60 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:border-indigo-300 hover:text-white md:inline-flex"
              >
                Dashboard
              </Link>
              <button
                onClick={async () => await logout()}
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-rose-900/40 transition hover:from-rose-400 hover:to-red-400"
              >
                Log out
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="hidden items-center justify-center rounded-full border border-indigo-400/60 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:border-indigo-300 hover:text-white sm:inline-flex"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-900/40 transition hover:from-indigo-400 hover:to-purple-400"
              >
                Create account
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
