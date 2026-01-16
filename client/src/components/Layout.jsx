import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Tooltip from './Tooltip';
import { 
  Home, 
  Users, 
  Calendar, 
  LogOut, 
  Film,
  Menu,
  X,
  Settings
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Groups', href: '/groups', icon: Users },
  { name: 'Users', href: '/users', icon: Users, adminOnly: true },
  { name: 'Settings', href: '/settings', icon: Settings, adminOnly: true }
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredNav = navigation.filter(item => !item.adminOnly || user?.isAdmin);

  // Local invite users get a minimal layout without navigation
  if (user?.isLocalInvite) {
    return (
      <div className="min-h-screen bg-gray-900">
        <div className="fixed top-0 left-0 right-0 z-50 bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Film className="h-8 w-8 text-indigo-500" />
            <span className="text-xl text-white">Voterr</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{user.username}</span>
            <button
              onClick={logout}
              className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Leave
            </button>
          </div>
        </div>
        <main className="pt-14">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Film className="h-8 w-8 text-indigo-500" />
          <span className="text-xl text-white">Voterr</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 text-gray-400 hover:text-white"
        >
          {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <aside className={clsx(
        "fixed inset-y-0 left-0 z-40 w-64 bg-gray-800 border-r border-gray-700 transform transition-transform duration-200 lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="hidden lg:flex items-center gap-3 px-6 py-5 border-b border-gray-700">
            <Film className="h-8 w-8 text-indigo-500" />
            <span className="text-xl text-white">Voterr</span>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1 mt-14 lg:mt-0">
            {filteredNav.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-indigo-600 text-white"
                      : "text-gray-300 hover:bg-gray-700 hover:text-white"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="px-4 py-4 border-t border-gray-700">
            <div className="flex items-center gap-3 px-3 py-2">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm text-white">
                  {user?.username?.[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{user?.username}</p>
                <p className="text-xs text-gray-400 truncate">
                  {user?.isLocal ? 'Local User' : 'Plex User'}
                </p>
              </div>
              <Tooltip content="Logout" position="left">
                <button
                  onClick={logout}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="lg:pl-64 pt-14 lg:pt-0">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
