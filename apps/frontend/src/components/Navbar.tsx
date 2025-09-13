import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

const Navbar = () => {
  const { user, logout } = useAppContext();

  return (
    <nav className="bg-white/3 absolute left-0 top-0 z-50 flex w-full items-center justify-between border-b border-white/10 px-6 py-4 text-white backdrop-blur-md">
      {/* Brand */}
      <div className="bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-2xl font-extrabold text-transparent drop-shadow-lg">
        <Link to="/">
          <img src="/src/assets/logo.png" alt="" className="size-10" />
        </Link>
      </div>

      {/* Menu */}
      <div className="flex items-center gap-4">
        {user ? (
          <>
            <span className="text-sm font-medium text-indigo-300">Welcome {user.username} ✨</span>
            <Link
              to="/profile"
              className="rounded-md bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:from-indigo-500 hover:to-purple-500"
            >
              Profile
            </Link>
            <button
              onClick={async () => await logout()}
              className="rounded-md bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:from-rose-500 hover:to-red-500"
            >
              Logout
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="rounded-md bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:from-green-500 hover:to-emerald-500"
          >
            Login
          </Link>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
