import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Tooltip from './Tooltip';
import CommandMenu from './CommandMenu';
import { 
  Home, 
  Users, 
  Calendar, 
  LogOut, 
  Film,
  Menu,
  X,
  Settings,
  Command,
  AlertTriangle,
  RefreshCw,
  Check,
  FileText
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { getModKey, isTouch } from '../lib/platform';
import clsx from 'clsx';

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Groups', href: '/groups', icon: Users },
  { name: 'Users', href: '/users', icon: Users, adminOnly: true },
  { name: 'Settings', href: '/settings', icon: Settings, adminOnly: true },
  { name: 'Logs', href: '/logs', icon: FileText, adminOnly: true }
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState({ groups: 0, movieNights: 0, users: 0 });
  const [version, setVersion] = useState(null);
  const [serviceStatus, setServiceStatus] = useState({ overseerr: null, tautulli: null });
  const [retrying, setRetrying] = useState({ overseerr: false, tautulli: false });
  const [retrySuccess, setRetrySuccess] = useState({ overseerr: false, tautulli: false });

  useEffect(() => {
    if (user && !user.isLocalInvite) {
      loadStats();
    }
  }, [user, location.pathname]);

  useEffect(() => {
    loadVersion();
  }, []);

  async function loadVersion() {
    try {
      const data = await api.get('/health');
      setVersion(data.version);
    } catch (error) {
      // Ignore
    }
  }

  // Service status: load immediately on mount
  useEffect(() => {
    loadServiceStatus();
  }, []);

  // Service status: poll every 10s, reload on visibility change and custom events
  useEffect(() => {
    if (!user || user.isLocalInvite) return;
    
    const interval = setInterval(loadServiceStatus, 10000);
    
    const handleServiceChange = () => loadServiceStatus();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadServiceStatus();
    };
    
    window.addEventListener('service-status-changed', handleServiceChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('service-status-changed', handleServiceChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  async function loadStats() {
    try {
      const data = await api.get('/dashboard/stats');
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async function loadServiceStatus() {
    try {
      const data = await api.get('/settings/services/status');
      setServiceStatus(data);
    } catch (error) {
      // Ignore - user may not have access
    }
  }

  async function handleRetry(service) {
    setRetrying(r => ({ ...r, [service]: true }));
    try {
      const result = await api.post(`/settings/retry/${service}`);
      await loadServiceStatus();
      
      // Show success message if connection restored
      if (result.success) {
        setRetrySuccess(s => ({ ...s, [service]: true }));
        setTimeout(() => setRetrySuccess(s => ({ ...s, [service]: false })), 3000);
      }
    } catch (error) {
      console.error(`Failed to retry ${service}:`, error);
      await loadServiceStatus();
    } finally {
      setRetrying(r => ({ ...r, [service]: false }));
    }
  }

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
            {!isTouch() && (
              <button
                onClick={() => {
                  const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true });
                  window.dispatchEvent(event);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 mb-2 rounded-lg text-sm text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
              >
                <Command className="h-5 w-5" />
                <span className="flex-1">Command Menu</span>
                <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-700 rounded">{getModKey()}K</kbd>
              </button>
            )}
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
                  <span className="flex-1">{item.name}</span>
                  {item.href === '/' && stats.movieNights > 0 && (
                    <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded">{stats.movieNights}</span>
                  )}
                  {item.href === '/groups' && stats.groups > 0 && (
                    <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded">{stats.groups}</span>
                  )}
                  {item.href === '/users' && stats.users > 0 && (
                    <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded">{stats.users}</span>
                  )}
                </Link>
              );
            })}

            {/* Service status warnings and success messages */}
            {user?.isAdmin && (serviceStatus.overseerr?.failed || serviceStatus.tautulli?.failed || retrySuccess.overseerr || retrySuccess.tautulli) && (
              <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
                {retrySuccess.overseerr && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 rounded-lg">
                    <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                    <p className="text-xs text-green-400">Overseerr connected</p>
                  </div>
                )}
                {retrySuccess.tautulli && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 rounded-lg">
                    <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                    <p className="text-xs text-green-400">Tautulli connected</p>
                  </div>
                )}
                {serviceStatus.overseerr?.failed && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-yellow-400 truncate">Overseerr</p>
                      {serviceStatus.overseerr.remainingMinutes && (
                        <p className="text-[10px] text-gray-500">{serviceStatus.overseerr.remainingMinutes}m until retry</p>
                      )}
                    </div>
                    <Tooltip content="Settings" position="top">
                      <Link
                        to="/settings"
                        onClick={() => setSidebarOpen(false)}
                        className="p-1 text-yellow-400 hover:text-yellow-300"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Link>
                    </Tooltip>
                    <Tooltip content="Retry" position="top">
                      <button
                        onClick={() => handleRetry('overseerr')}
                        disabled={retrying.overseerr}
                        className="p-1 text-yellow-400 hover:text-yellow-300 disabled:opacity-50"
                      >
                        <RefreshCw className={clsx("h-3.5 w-3.5", retrying.overseerr && "animate-spin")} />
                      </button>
                    </Tooltip>
                  </div>
                )}
                {serviceStatus.tautulli?.failed && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-yellow-400 truncate">Tautulli</p>
                      {serviceStatus.tautulli.remainingMinutes && (
                        <p className="text-[10px] text-gray-500">{serviceStatus.tautulli.remainingMinutes}m until retry</p>
                      )}
                    </div>
                    <Tooltip content="Settings" position="top">
                      <Link
                        to="/settings"
                        onClick={() => setSidebarOpen(false)}
                        className="p-1 text-yellow-400 hover:text-yellow-300"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Link>
                    </Tooltip>
                    <Tooltip content="Retry" position="top">
                      <button
                        onClick={() => handleRetry('tautulli')}
                        disabled={retrying.tautulli}
                        className="p-1 text-yellow-400 hover:text-yellow-300 disabled:opacity-50"
                      >
                        <RefreshCw className={clsx("h-3.5 w-3.5", retrying.tautulli && "animate-spin")} />
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
            )}
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
            {version && (
              <p className="px-3 mt-1 text-[10px] text-gray-500">v{version}</p>
            )}
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

      <CommandMenu />
    </div>
  );
}
