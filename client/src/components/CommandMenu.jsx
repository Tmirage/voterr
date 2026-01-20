import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { 
  Home, 
  Users, 
  Settings, 
  LogOut, 
  Calendar,
  Plus,
  Search,
  Film
} from 'lucide-react';
import { getModKey, isTouch } from '../lib/platform';
import { format, parseISO } from 'date-fns';
import './CommandMenu.css';

export default function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [movieNights, setMovieNights] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const modKey = getModKey();

  useEffect(() => {
    if (open && user) {
      loadMovieNights();
    }
  }, [open, user]);

  async function loadMovieNights() {
    try {
      const data = await api.get('/dashboard');
      setMovieNights(data.movieNights?.slice(0, 9) || []);
    } catch (error) {
      console.error('Failed to load movie nights:', error);
    }
  }

  useEffect(() => {
    if (isTouch()) return;

    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (movieNights[index]) {
          e.preventDefault();
          navigate(`/movie-night/${movieNights[index].id}`);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [movieNights, navigate]);

  function runCommand(command) {
    setOpen(false);
    command();
  }

  if (!user || user.isLocalInvite || isTouch()) {
    return null;
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command Menu"
      className="command-dialog"
    >
      <div className="command-wrapper">
        <Command.Input 
          placeholder="Type a command or search..." 
          className="command-input"
        />
        <Command.List className="command-list">
          <Command.Empty className="command-empty">No results found.</Command.Empty>

          {movieNights.length > 0 && (
            <Command.Group heading="Movie Nights" className="command-group">
              {movieNights.map((night, index) => (
                <Command.Item
                  key={night.id}
                  onSelect={() => runCommand(() => navigate(`/movie-night/${night.id}`))}
                  className="command-item"
                >
                  <Film className="h-4 w-4" />
                  <span>{night.scheduleName || 'Movie Night'}</span>
                  <span className="text-xs text-gray-500 ml-1">
                    {night.groupName} · {format(parseISO(night.date), 'EEE d MMM')}
                  </span>
                  <kbd className="command-shortcut">{modKey}{index + 1}</kbd>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Navigation" className="command-group">
            <Command.Item
              onSelect={() => runCommand(() => navigate('/'))}
              className="command-item"
            >
              <Home className="h-4 w-4" />
              <span>Dashboard</span>
            </Command.Item>
            <Command.Item
              onSelect={() => runCommand(() => navigate('/groups'))}
              className="command-item"
            >
              <Users className="h-4 w-4" />
              <span>Groups</span>
            </Command.Item>
            {user?.isAdmin && (
              <>
                <Command.Item
                  onSelect={() => runCommand(() => navigate('/users'))}
                  className="command-item"
                >
                  <Users className="h-4 w-4" />
                  <span>Users</span>
                </Command.Item>
                <Command.Item
                  onSelect={() => runCommand(() => navigate('/settings'))}
                  className="command-item"
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Command.Item>
              </>
            )}
          </Command.Group>

          <Command.Group heading="Account" className="command-group">
            <Command.Item
              onSelect={() => runCommand(logout)}
              className="command-item"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </Command.Item>
          </Command.Group>
        </Command.List>

        <div className="command-footer">
          <span className="command-hint">
            <kbd>{modKey}</kbd><kbd>K</kbd> to toggle
          </span>
          <span className="command-hint">
            <kbd>↑↓</kbd> to navigate
          </span>
          <span className="command-hint">
            <kbd>Enter</kbd> to select
          </span>
          <span className="command-hint">
            <kbd>Esc</kbd> to close
          </span>
        </div>
      </div>
    </Command.Dialog>
  );
}
