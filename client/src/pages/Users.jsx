import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Users as UsersIcon, UserPlus, Trash2, Download, Shield, ShieldOff, Pencil, Check, X } from 'lucide-react';
import clsx from 'clsx';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import { isTouch, getModKey } from '../lib/platform';

export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [plexFriends, setPlexFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddLocal, setShowAddLocal] = useState(false);
  const [showImportPlex, setShowImportPlex] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '' });
  const [selectedFriends, setSelectedFriends] = useState(new Set());
  const [confirmModal, setConfirmModal] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ username: '', email: '' });

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const data = await api.get('/users');
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadPlexFriends() {
    try {
      const friends = await api.get('/users/plex-friends');
      setPlexFriends(friends);
      setShowImportPlex(true);
    } catch (error) {
      console.error('Failed to load Plex friends:', error);
    }
  }

  async function handleImportPlex(friends) {
    try {
      for (const friend of friends) {
        await api.post('/users/import-plex', friend);
      }
      await loadUsers();
      setPlexFriends(plexFriends.filter(f => !friends.some(fr => fr.plexId === f.plexId)));
      setSelectedFriends(new Set());
    } catch (error) {
      console.error('Failed to import users:', error);
    }
  }

  function toggleFriendSelection(friend) {
    const newSelected = new Set(selectedFriends);
    if (newSelected.has(friend.plexId)) {
      newSelected.delete(friend.plexId);
    } else {
      newSelected.add(friend.plexId);
    }
    setSelectedFriends(newSelected);
  }

  function selectAllFriends() {
    if (selectedFriends.size === plexFriends.length) {
      setSelectedFriends(new Set());
    } else {
      setSelectedFriends(new Set(plexFriends.map(f => f.plexId)));
    }
  }

  async function handleToggleAdmin(userId) {
    try {
      await api.patch(`/users/${userId}/admin`);
      await loadUsers();
    } catch (error) {
      console.error('Failed to toggle admin:', error);
    }
  }

  function startEditUser(u) {
    setEditingUser(u);
    setEditForm({ username: u.username, email: u.email || '' });
  }

  async function saveEditUser() {
    if (!editForm.username.trim()) return;
    try {
      const payload = editingUser.isLocal 
        ? { username: editForm.username, email: editForm.email }
        : { username: editForm.username };
      await api.patch(`/users/${editingUser.id}`, payload);
      setUsers(users.map(u => u.id === editingUser.id 
        ? { ...u, username: editForm.username.trim(), email: editingUser.isLocal ? (editForm.email?.trim() || null) : u.email } 
        : u
      ));
      setEditingUser(null);
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  }

  function cancelEditUser() {
    setEditingUser(null);
    setEditForm({ username: '', email: '' });
  }

  async function handleCreateLocal(e) {
    e.preventDefault();
    if (!newUser.username.trim()) return;

    try {
      await api.post('/users/local', newUser);
      await loadUsers();
      setShowAddLocal(false);
      setNewUser({ username: '', email: '' });
    } catch (error) {
      console.error('Failed to create user:', error);
    }
  }

  function handleDelete(userId) {
    setConfirmModal({
      title: 'Delete User',
      message: 'Delete this user? This cannot be undone.',
      confirmText: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await api.delete(`/users/${userId}`);
          setUsers(users.filter(u => u.id !== userId));
        } catch (error) {
          console.error('Failed to delete user:', error);
        }
        setConfirmModal(null);
      }
    });
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl text-white">Users</h1>
          <p className="text-gray-400 text-sm">Manage Plex and local users</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadPlexFriends}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-[#e5a00d] hover:bg-[#cc8f0c] text-black rounded-lg transition-colors text-sm"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Import</span> Plex
          </button>
          <button
            onClick={() => setShowAddLocal(true)}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Add</span> Local
          </button>
        </div>
      </div>

      <details className="bg-gray-800 rounded-xl mb-6 group">
        <summary className="p-4 cursor-pointer text-sm text-gray-300 list-none flex items-center justify-between">
          <span>User roles and types</span>
          <span className="text-gray-500 text-xs group-open:hidden">tap to expand</span>
        </summary>
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="flex items-start gap-2">
            <span className="px-1.5 py-0.5 rounded bg-purple-600/30 text-purple-300 shrink-0">App Admin</span>
            <span className="text-gray-400">Full control over settings and users.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-1.5 py-0.5 rounded bg-indigo-600/30 text-indigo-300 shrink-0">Admin</span>
            <span className="text-gray-400">Can manage groups and movie nights.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-1.5 py-0.5 rounded bg-orange-600/30 text-orange-300 shrink-0">Plex</span>
            <span className="text-gray-400">Login with Plex account.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-1.5 py-0.5 rounded bg-gray-600/50 text-gray-400 shrink-0">Local</span>
            <span className="text-gray-400">Need invite link to vote.</span>
          </div>
        </div>
      </details>

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg text-white">All Users ({users.length})</h2>
        </div>

        <div className="divide-y divide-gray-700">
          {users.map((u) => (
            <div key={u.id} className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                {u.avatarUrl ? (
                  <img
                    src={u.avatarUrl}
                    alt={u.username}
                    className="h-8 w-8 sm:h-10 sm:w-10 rounded-full shrink-0"
                  />
                ) : (
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gray-600 flex items-center justify-center text-white text-sm shrink-0">
                    {u.username[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                    {editingUser?.id === u.id && !u.isLocal ? (
                      <form onSubmit={(e) => { e.preventDefault(); saveEditUser(); }} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editForm.username}
                          onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                          className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-indigo-500 w-32"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelEditUser();
                            }
                          }}
                        />
                        <button type="submit" className="p-1 text-green-400 hover:text-green-300">
                          <Check className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={cancelEditUser} className="p-1 text-gray-400 hover:text-gray-300">
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    ) : (
                      <span className="flex items-center gap-1">
                        <p className="text-white">{u.username}</p>
                        {(user.isAppAdmin || u.id === user.id) && (
                          <button
                            onClick={() => startEditUser(u)}
                            className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                            title={u.isLocal ? "Edit user" : "Edit display name"}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    )}
                    {u.isAppAdmin && (
                      <span className="px-1.5 py-0.5 text-xs rounded bg-purple-600/30 text-purple-300">App Admin</span>
                    )}
                    {u.isAdmin && !u.isAppAdmin && (
                      <span className="px-1.5 py-0.5 text-xs rounded bg-indigo-600/30 text-indigo-300">Admin</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={clsx(
                      "px-1.5 py-0.5 text-xs rounded",
                      u.isLocal ? "bg-gray-600/50 text-gray-400" : "bg-orange-600/30 text-orange-300"
                    )}>
                      {u.isLocal ? 'Local' : 'Plex'}
                    </span>
                    {u.email && <span className="text-xs text-gray-500">{u.email}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center shrink-0">
                {user.isAppAdmin && u.id !== user.id && !u.isAppAdmin && (
                  <>
                    {!u.isLocal && (
                      <button
                        onClick={() => handleToggleAdmin(u.id)}
                        className={clsx(
                          "p-1.5 sm:p-2 transition-colors",
                          u.isAdmin ? "text-indigo-400 hover:text-indigo-300" : "text-gray-400 hover:text-indigo-400"
                        )}
                        title={u.isAdmin ? "Remove admin" : "Make admin"}
                      >
                        {u.isAdmin ? <Shield className="h-4 w-4 sm:h-5 sm:w-5" /> : <ShieldOff className="h-4 w-4 sm:h-5 sm:w-5" />}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="p-1.5 sm:p-2 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingUser?.isLocal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelEditUser();
            }
          }}
        >
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl text-white mb-4">Edit Local User</h2>
            <form onSubmit={(e) => { e.preventDefault(); saveEditUser(); }} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Username</label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-3 justify-end items-center">
                <button
                  type="button"
                  onClick={cancelEditUser}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors flex items-center gap-2"
                >
                  Cancel
                  {!isTouch() && <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-700 rounded">Esc</kbd>}
                </button>
                <button
                  type="submit"
                  disabled={!editForm.username.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddLocal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setShowAddLocal(false);
            }
          }}
        >
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl text-white mb-4">Add Local User</h2>
            <form onSubmit={handleCreateLocal} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Username</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && newUser.username.trim()) {
                      e.preventDefault();
                      handleCreateLocal(e);
                    }
                  }}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && newUser.username.trim()) {
                      e.preventDefault();
                      handleCreateLocal(e);
                    }
                  }}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-3 justify-end items-center">
                <button
                  type="button"
                  onClick={() => setShowAddLocal(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors flex items-center gap-2"
                >
                  Cancel
                  {!isTouch() && <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-700 rounded">Esc</kbd>}
                </button>
                <button
                  type="submit"
                  disabled={!newUser.username.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  Create
                  {!isTouch() && <kbd className="text-[10px] px-1.5 py-0.5 bg-black/20 rounded">{getModKey()}↵</kbd>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportPlex && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setShowImportPlex(false);
              setSelectedFriends(new Set());
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && selectedFriends.size > 0) {
              e.preventDefault();
              handleImportPlex(plexFriends.filter(f => selectedFriends.has(f.plexId)));
            }
          }}
          tabIndex={0}
        >
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl text-white mb-4">Import Plex Friends</h2>
            
            {plexFriends.length === 0 ? (
              <p className="text-gray-400">No Plex friends available to import</p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={selectAllFriends}
                    className="text-sm text-indigo-400 hover:text-indigo-300"
                  >
                    {selectedFriends.size === plexFriends.length ? 'Deselect all' : 'Select all'}
                  </button>
                  <span className="text-sm text-gray-400">{selectedFriends.size} selected</span>
                </div>
                <div className="space-y-2">
                  {plexFriends.map((friend) => (
                    <button
                      key={friend.plexId}
                      onClick={() => toggleFriendSelection(friend)}
                      className={clsx(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                        selectedFriends.has(friend.plexId) 
                          ? "bg-indigo-600/30 border border-indigo-500" 
                          : "bg-gray-700 hover:bg-gray-600"
                      )}
                    >
                      <div className={clsx(
                        "w-5 h-5 rounded border flex items-center justify-center",
                        selectedFriends.has(friend.plexId) 
                          ? "bg-indigo-600 border-indigo-600" 
                          : "border-gray-500"
                      )}>
                        {selectedFriends.has(friend.plexId) && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      {friend.avatarUrl ? (
                        <img src={friend.avatarUrl} alt={friend.username} className="h-8 w-8 rounded-full" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gray-600 flex items-center justify-center text-sm text-white">
                          {friend.username[0].toUpperCase()}
                        </div>
                      )}
                      <div className="text-left">
                        <p className="text-white">{friend.username}</p>
                        {friend.email && (
                          <p className="text-xs text-gray-400">{friend.email}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="mt-4 flex gap-3 items-center">
              <button
                onClick={() => { setShowImportPlex(false); setSelectedFriends(new Set()); }}
                className="flex-1 px-4 py-2 text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                Cancel
                {!isTouch() && <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-700 rounded">Esc</kbd>}
              </button>
              {selectedFriends.size > 0 && (
                <button
                  onClick={() => handleImportPlex(plexFriends.filter(f => selectedFriends.has(f.plexId)))}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  Import {selectedFriends.size}
                  {!isTouch() && <kbd className="text-[10px] px-1.5 py-0.5 bg-black/20 rounded">{getModKey()}↵</kbd>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          destructive={confirmModal.destructive}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}
