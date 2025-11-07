import { useEffect, useLayoutEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useSidebar } from '../context/SidebarContext';
import { FiMenu, FiX } from 'react-icons/fi';
import logoImg from '../assets/logo.png';

const baseLinks = [
  { label: 'Home', to: '/' },
  { label: 'Pong', to: '/pong' },
];

const profileLinks = [
  { label: 'Profile', to: '/profile' },
  { label: 'Stats', to: '/profile/stats' },
  { label: 'Friends', to: '/profile/friends' },
];

const Navbar = () => {
  const { user, logout } = useAppContext();
  const location = useLocation();
  const { isOpen: sidebarOpen, toggle: toggleSidebar, close: closeSidebar } = useSidebar();

  // Close the sidebar on route change
  useEffect(() => {
    closeSidebar();
  }, [location.pathname, closeSidebar]);

  const mobileLinks = user ? [...baseLinks, ...profileLinks] : baseLinks;
  const navBackgroundClass = sidebarOpen ? 'bg-slate-950' : 'bg-slate-950/80 backdrop-blur-xl';

  // --- Measure navbar height and expose it as --navbar-h ---
  const navRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const setVar = () => {
      const h = el.offsetHeight || 0;
      const current = getComputedStyle(document.documentElement)
        .getPropertyValue('--navbar-h')
        .trim();
      const next = `${h}px`;
      if (current !== next) {
        document.documentElement.style.setProperty('--navbar-h', next);
      }
    };

    setVar();

    // Observe size changes (content/responsive)
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(setVar);
      ro.observe(el);
    }

    // Also respond to window resizes (safe fallback)
    window.addEventListener('resize', setVar);

    // Recompute after microtasks (e.g., icon swap, text changes)
    const tick = requestAnimationFrame(setVar);

    return () => {
      window.removeEventListener('resize', setVar);
      if (ro) ro.disconnect();
      cancelAnimationFrame(tick);
    };
  }, [sidebarOpen]);

  // Lock page scroll when the drawer is open
  useEffect(() => {
    const root = document.documentElement;
    if (sidebarOpen) {
      root.classList.add('overflow-hidden');
    } else {
      root.classList.remove('overflow-hidden');
    }
    return () => root.classList.remove('overflow-hidden');
  }, [sidebarOpen]);

  return (
    <nav
      ref={navRef}
      data-app-navbar
      role="navigation"
      aria-label="Primary"
      className={`fixed inset-x-0 top-0 z-50 border-b border-white/10 text-white shadow-[0_10px_30px_-20px_rgba(67,56,202,0.75)] ${navBackgroundClass}`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-4 py-5 sm:px-6 lg:px-12">
        <div className="flex items-center gap-3">
          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Toggle profile navigation"
            aria-controls="profile-sidebar"
            aria-expanded={sidebarOpen}
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 text-white shadow-lg shadow-indigo-900/40 backdrop-blur-md transition hover:bg-indigo-400/70 md:hidden"
          >
            {sidebarOpen ? <FiX size={24} /> : <FiMenu size={24} />}
          </button>

          {/* Brand / Home */}
          <Link to="/" className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl">
              <img src={logoImg} alt="Arcade home" className="h-9 w-9" />
            </span>
            <span className="hidden text-lg font-semibold tracking-wide text-indigo-100 sm:inline">
              Arcade Transcendence
            </span>
          </Link>
        </div>

        {/* Desktop primary links */}
        <div className="hidden items-center gap-6 text-sm font-medium text-slate-200/80 md:flex">
          {baseLinks.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`relative transition hover:text-white ${isActive ? 'text-white' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {link.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-2 left-0 h-[2px] w-full bg-gradient-to-r from-indigo-400 to-purple-400"
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Auth controls */}
        <div className="flex items-center gap-3">
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
                type="button"
                onClick={async () => await logout()}
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-rose-900/40 transition hover:from-rose-400 hover:to-red-400 cursor-pointer"
              >
                Log out
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-full border border-indigo-400/60 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:border-indigo-300 hover:text-white"
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

      {/* Mobile drawer + scrim */}
      {sidebarOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-[var(--navbar-h,80px)] z-40 bg-slate-950/60 backdrop-blur md:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        >
          <nav
            id="profile-sidebar"
            aria-label="Profile"
            className="relative flex h-full w-full max-w-[80%] flex-col gap-4 px-6 pb-10 pt-6 shadow-2xl shadow-indigo-950/30"
            onClick={(event) => event.stopPropagation()}
            style={{ background: '#0f172a' }}
          >
            <div className="absolute inset-0 opacity-90" style={{ background: '#0f172a' }} />
            <div className="relative z-10 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.3em] text-indigo-200">Navigate</span>
              <button
                type="button"
                onClick={closeSidebar}
                aria-label="Close navigation menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10"
              >
                <FiX size={20} />
              </button>
            </div>

            <div className="relative z-10 flex flex-col gap-2">
              {mobileLinks.map((link) => {
                const active = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={closeSidebar}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white transition hover:border-indigo-400/40 hover:bg-white/10 ${
                      active ? 'bg-white/10 text-indigo-200' : ''
                    }`}
                  >
                    {link.label}
                    <span
                      className="text-xs uppercase tracking-[0.3em] text-slate-400"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
