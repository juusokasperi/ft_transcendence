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
    <div className="md:w-64 w-12 border-r mt-12 h-full text-base border-gray-300 pt-3 flex flex-col transition-all duration-300">
      {sideBarLinks.map((item, index) => (
        <NavLink
          to={item.path}
          key={index}
          end
          className={({ isActive }) =>
            `flex items-center py-3 px-4 md:px-8 gap-3 ${
              isActive
                ? 'border-r-4 md:border-r-[6px] bg-blue-600/10 border-blue-600 text-blue-600'
                : 'hover:bg-gray-100/90 border-white text-gray-700'
            }`
          }
        >
          <p className="md:block hidden text-center">{item.name}</p>
        </NavLink>
      ))}
    </div>
  );
};

export default Sidebar;
