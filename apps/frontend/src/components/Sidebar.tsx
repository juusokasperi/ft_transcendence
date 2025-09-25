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
    <aside className="hidden md:sticky md:top-24 md:flex md:min-h-[calc(100vh-6rem)] md:w-64 md:flex-col md:border-r md:border-white/10 md:bg-slate-900/70 md:pb-10 md:pt-24 md:text-sm md:text-slate-100 md:shadow-lg md:shadow-indigo-950/20 md:backdrop-blur-xl">
      <div className="px-6 pb-6">
        <p className="mb-4 text-xs uppercase tracking-[0.35em] text-slate-300/80">Profile</p>
        <nav className="space-y-1">
          {sideBarLinks.map((item) => (
            <NavLink
              to={item.path}
              key={item.path}
              end
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-3 ${
                  isActive
                    ? 'border border-indigo-300/40 bg-indigo-400/15 text-white shadow-sm shadow-indigo-900/30'
                    : 'border border-transparent text-slate-200/80 transition hover:border-indigo-300/30 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="flex-1 text-sm font-medium">{item.name}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;
