import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import LoadingSpinner from '../components/LoadingSpinner';
import { api } from '../lib/api';
import { Users, Plus, ChevronRight, Calendar } from 'lucide-react';

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    try {
      const data = await api.get('/groups');
      setGroups(data);
    } catch (error) {
      console.error('Failed to load groups:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newGroup.name.trim()) return;

    setCreating(true);
    try {
      const group = await api.post('/groups', newGroup);
      setGroups([...groups, { ...group, memberCount: 1 }]);
      setShowCreate(false);
      setNewGroup({ name: '', description: '' });
    } catch (error) {
      console.error('Failed to create group:', error);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-white">Groups</h1>
          <p className="text-gray-400">Manage your movie night groups</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
        >
          <Plus className="h-5 w-5" />
          New Group
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl text-white mb-4">Create Group</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value.slice(0, 35) })}
                  maxLength={35}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Movie Night Crew"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <textarea
                  value={newGroup.description}
                  onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500 resize-none"
                  rows={3}
                  placeholder="Optional description..."
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newGroup.name.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <Users className="h-16 w-16 mx-auto mb-4 text-gray-600" />
          <h2 className="text-xl text-white mb-2">No groups yet</h2>
          <p className="text-gray-400 mb-6">Create a group to start organizing movie nights</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            <Plus className="h-5 w-5" />
            Create Your First Group
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {groups.map((group) => (
            <Link
              key={group.id}
              to={`/groups/${group.id}`}
              className="bg-gray-800 rounded-xl p-6 hover:bg-gray-750 transition-colors group flex gap-5"
            >
              {group.imageUrl ? (
                <img 
                  src={group.imageUrl} 
                  alt={group.name}
                  className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-20 h-20 bg-indigo-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Users className="h-8 w-8 text-indigo-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <h3 className="text-lg text-white truncate">{group.name}</h3>
                  <ChevronRight className="h-5 w-5 text-gray-500 group-hover:text-gray-400 transition-colors flex-shrink-0 ml-2" />
                </div>
                {group.description && (
                  <p className="text-sm text-gray-400 mt-1 line-clamp-2">{group.description}</p>
                )}
                <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                  <span>{group.memberCount} member{group.memberCount !== 1 ? 's' : ''}</span>
                  {group.upcomingNight && (
                    <span className="flex items-center gap-1 text-indigo-400">
                      <Calendar className="h-4 w-4" />
                      {new Date(group.upcomingNight.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
