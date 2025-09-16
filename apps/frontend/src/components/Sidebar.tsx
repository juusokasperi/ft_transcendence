import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { FiMenu, FiX } from 'react-icons/fi';

interface SideBarLink {
  name: string;
  path: string;
}

const sideBarLinks: SideBarLink[] = [
  { name: 'Profile', path: '/profile' },
  { name: 'Stats', path: '/profile/stats' },
  { name: 'Friends', path: '/profile/friends' },
];

const Sidebar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button
        className=" fixed top-16 left-6 z-50 flex h-8 w-8 items-center justify-center rounded bg-purple-800 text-white md:hidden"

        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <FiX size={24} /> : <FiMenu size={24} />}
      </button>

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 z-40 h-full w-64 flex-col border-r border-gray-300 bg-white pt-28 text-base transition-transform duration-300 md:relative md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sideBarLinks.map((item, index) => (
          <NavLink
            to={item.path}
            key={index}
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 md:px-8 ${
                isActive
                  ? 'border-r-4 border-blue-600 bg-blue-600/10 text-blue-600 md:border-r-[6px]'
                  : 'border-white text-gray-700 hover:bg-gray-100/90'
              }`
            }
            onClick={() => setIsOpen(false)} // close menu on mobile after click
          >
            <p className="text-center">{item.name}</p>
          </NavLink>
        ))}
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

export default Sidebar;
