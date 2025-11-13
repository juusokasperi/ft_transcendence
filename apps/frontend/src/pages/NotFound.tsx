import { Link } from 'react-router-dom';
import { Home, Gamepad2, User, Users } from 'lucide-react';

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4">
      <div className="w-full max-w-2xl text-center">
        <div className="mb-8">
          <h1 className="bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-9xl font-bold text-transparent">
            404
          </h1>
          <h2 className="mb-2 mt-4 text-3xl font-semibold text-white">Page Not Found</h2>
          <p className="text-lg text-gray-400">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            to="/"
            className="flex items-center justify-center gap-3 rounded-lg bg-blue-600 px-6 py-4 font-medium text-white transition-colors duration-200 hover:bg-blue-700"
          >
            <Home size={20} />
            <span>Home</span>
          </Link>

          <Link
            to="/pong"
            className="flex items-center justify-center gap-3 rounded-lg bg-purple-600 px-6 py-4 font-medium text-white transition-colors duration-200 hover:bg-purple-700"
          >
            <Gamepad2 size={20} />
            <span>Play Pong</span>
          </Link>

          <Link
            to="/profile"
            className="flex items-center justify-center gap-3 rounded-lg bg-green-600 px-6 py-4 font-medium text-white transition-colors duration-200 hover:bg-green-700"
          >
            <User size={20} />
            <span>Profile</span>
          </Link>

          <Link
            to="/profile/friends"
            className="flex items-center justify-center gap-3 rounded-lg bg-orange-600 px-6 py-4 font-medium text-white transition-colors duration-200 hover:bg-orange-700"
          >
            <Users size={20} />
            <span>Friends</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
