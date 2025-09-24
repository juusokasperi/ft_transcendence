import React from 'react';
import { NavLink } from 'react-router-dom';
import { useSidebar } from '../context/SidebarContext';

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
  const { isOpen, close } = useSidebar();

  return (
    <>
      <div
        id="profile-sidebar"
        className={`fixed left-0 top-24 bottom-0 z-40 flex w-64 flex-col overflow-y-auto border-r border-white/15 bg-slate-900/70 text-sm text-slate-100 shadow-lg shadow-indigo-950/20 backdrop-blur-xl transition-transform duration-300 md:static md:mt-24 md:h-[calc(100vh-6rem)] md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-4 py-6">
          <p className="mb-4 text-xs uppercase tracking-[0.35em] text-slate-300/80">Profile</p>
          <div className="space-y-1">
            {sideBarLinks.map((item, index) => (
              <NavLink
                to={item.path}
                key={index}
                end
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-4 py-3 md:px-6 ${
                    isActive
                      ? 'border border-indigo-300/40 bg-indigo-400/15 text-white shadow-sm shadow-indigo-900/30'
                      : 'border border-transparent text-slate-200/80 transition hover:border-indigo-300/30 hover:bg-white/10 hover:text-white'
                  }`
                }
                onClick={close}
              >
                <span className="flex-1 text-sm font-medium">{item.name}</span>
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500 md:hidden">
                  →
                </span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur md:hidden"
          onClick={close}
        />
      )}
    </>
  );
};

export default Sidebar;
