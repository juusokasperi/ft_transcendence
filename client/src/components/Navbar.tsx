import React, { useState } from "react";
import { Link } from "react-router-dom";


const Navbar = () => {


    const [user, setUser] = useState(false);

  return (
    <nav className="bg-gray-800 text-white px-6 py-4 flex justify-between items-center">
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
            <Link
              to="/signup"
              className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded"
            >
              Signup
            </Link>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
