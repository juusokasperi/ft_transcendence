import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { div } from 'framer-motion/client';

const Navbar = () => {
  const { user, logout } = useAppContext();

  return (
    <nav className="text-white px-6 py-4 flex justify-between items-center bg-transparent absolute top-0 left-0 w-full z-50">
      <div className="text-xl font-bold text-amber-500">
        <Link to="/">Poooong</Link>
      </div>

      <div className="space-x-4">
        {user ? (
          <div className="flex justify-between space-x-4">
            <span className="text-amber-500 text-center">Welcome {user.username} :D</span>
            <Link to="/profile" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">
              Profile
            </Link>
            <button
              onClick={logout}
              className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded"
            >
              Logout
            </button>
          </div>
        ) : (
          <>
            <Link to="/login" className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded">
              Login
            </Link>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
