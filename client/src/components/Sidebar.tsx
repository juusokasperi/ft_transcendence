import React from 'react';
import { NavLink } from 'react-router-dom';

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
  return (
    <div className="mt-12 flex h-full w-12 flex-col border-r border-gray-300 pt-3 text-base transition-all duration-300 md:w-64">
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
        >
          <p className="hidden text-center md:block">{item.name}</p>
        </NavLink>
      ))}
    </div>
  );
};

export default Sidebar;
