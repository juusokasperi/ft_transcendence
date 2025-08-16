import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAppContext } from '../context/AppContext' 


const Navbar = () => {


  const { user, logout } = useAppContext();

  return (
    <nav className="text-white px-6 py-4 flex justify-between items-center bg-transparent absolute top-0 left-0 w-full z-50">

      <div className="text-xl font-bold">
        <Link to="/">Poooong</Link>
      </div>

      <div className="space-x-4">
        {user ? (
          <Link
            to="/dashboard"
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
          >
            Dashboard
          </Link>
        ) : (
          <>
            <Link
              to="/login"
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
            >
              Login
            </Link>
          </>
        )}
        {user && (
        <button
          onClick={logout}
          className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded"
        >
          Logout
        </button>
      )}
      </div>
    </nav>
  );
};

export default Navbar;
