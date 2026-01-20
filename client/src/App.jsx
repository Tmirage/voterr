import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Groups from './pages/Groups';
import GroupDetail from './pages/GroupDetail';
import MovieNight from './pages/MovieNight';
import Users from './pages/Users';
import Settings from './pages/Settings';
import GuestJoin from './pages/GuestJoin';
import PlexLoading from './pages/PlexLoading';

function ProtectedRoute({ children }) {
  const { user, loading, setupComplete } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!setupComplete) {
    return <Navigate to="/setup" replace />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Local invite users can only access their specific movie night
  if (user.isLocalInvite && user.localInviteMovieNightId) {
    const allowedPath = `/movie-night/${user.localInviteMovieNightId}`;
    if (!location.pathname.startsWith(allowedPath)) {
      return <Navigate to={allowedPath} replace />;
    }
  }

  return children;
}

function SetupRoute({ children }) {
  const { loading, setupComplete } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (setupComplete) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function LoginRoute({ children }) {
  const { user, loading, setupComplete } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!setupComplete) {
    return <Navigate to="/setup" replace />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupRoute><Setup /></SetupRoute>} />
      <Route path="/login" element={<LoginRoute><Login /></LoginRoute>} />
      <Route path="/join/:token" element={<GuestJoin />} />
      <Route path="/plex-loading" element={<PlexLoading />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/groups" element={<Groups />} />
                <Route path="/groups/:id" element={<GroupDetail />} />
                <Route path="/movie-night/:id" element={<MovieNight />} />
                <Route path="/users" element={<Users />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
