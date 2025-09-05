import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { div } from 'framer-motion/client';

const Navbar = () => {
  const { user, logout } = useAppContext();

  return (
    <nav className="absolute left-0 top-0 z-50 flex w-full items-center justify-between bg-transparent px-6 py-4 text-white">
      <div className="text-xl font-bold text-amber-500">
        <Link to="/">Poooong</Link>
      </div>

      <div className="space-x-4">
        {user ? (
          <div className="flex justify-between space-x-4">
            <span className="text-center text-amber-500">Welcome {user.username} :D</span>
            <Link to="/profile" className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700">
              Profile
            </Link>
            <button
              onClick={logout}
              className="rounded bg-yellow-600 px-4 py-2 hover:bg-yellow-700"
            >
              Logout
            </button>
          </div>
        ) : (
          <>
            <Link to="/login" className="rounded bg-green-600 px-4 py-2 hover:bg-green-700">
              Login
            </Link>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
