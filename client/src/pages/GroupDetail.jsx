import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  Calendar, 
  Plus, 
  UserPlus, 
  ChevronRight,
  Trash2,
  Clock,
  Pencil,
  Upload
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';
import ConfirmModal from '../components/ConfirmModal';
import ImageCropper from '../components/ImageCropper';
import AnimatedList from '../components/AnimatedList';
import LoadingSpinner from '../components/LoadingSpinner';
import DatePicker from '../components/DatePicker';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingImage, setEditingImage] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [cropImage, setCropImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [showDeleteGroup, setShowDeleteGroup] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [movieNights, setMovieNights] = useState([]);
  const [historyNights, setHistoryNights] = useState([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null);
  const [showCreateSchedule, setShowCreateSchedule] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [newSchedule, setNewSchedule] = useState({
    name: 'Movie Night',
    dayOfWeek: 3,
    time: '20:00',
    recurrenceType: 'weekly',
    advanceCount: 1,
    fixedDate: ''
  });

  const RECURRENCE_LABELS = {
    weekly: 'Weekly',
    biweekly: 'Bi-weekly',
    monthly: 'Monthly',
    none: 'One-time'
  };

  useEffect(() => {
    loadGroup();
  }, [id]);

  async function loadGroup() {
    try {
      const [groupData, schedulesData, nightsData] = await Promise.all([
        api.get(`/groups/${id}`),
        api.get(`/schedules/group/${id}`),
        api.get(`/schedules/movie-nights/group/${id}`)
      ]);
      setGroup(groupData);
      setSchedules(schedulesData);
      setMovieNights(nightsData);
    } catch (error) {
      console.error('Failed to load group:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(page = 0) {
    setLoadingHistory(true);
    try {
      const data = await api.get(`/schedules/movie-nights/group/${id}/history?page=${page}`);
      if (page === 0) {
        setHistoryNights(data.nights);
      } else {
        setHistoryNights(prev => [...prev, ...data.nights]);
      }
      setHistoryHasMore(data.hasMore);
      setHistoryTotal(data.total);
      setHistoryPage(page);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoadingHistory(false);
    }
  }

  function handleShowHistory() {
    setShowHistory(true);
    if (historyNights.length === 0) {
      loadHistory(0);
    }
  }

  async function handleUpdateGroupName() {
    if (!newGroupName.trim()) return;
    try {
      await api.patch(`/groups/${id}`, { name: newGroupName.trim(), description: group.description, imageUrl: group.imageUrl });
      await loadGroup();
      setEditingName(false);
    } catch (error) {
      console.error('Failed to update group:', error);
    }
  }

  async function handleUpdateImage() {
    try {
      await api.patch(`/groups/${id}`, { name: group.name, description: group.description, imageUrl: newImageUrl.trim() || null });
      await loadGroup();
      setEditingImage(false);
    } catch (error) {
      console.error('Failed to update group image:', error);
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = () => {
      setCropImage(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleCropComplete(croppedBlob) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', croppedBlob, 'group-image.jpg');
      
      const response = await api.upload('/images/upload', formData);
      await api.patch(`/groups/${id}`, { 
        name: group.name, 
        description: group.description, 
        imageUrl: response.url 
      });
      await loadGroup();
      setCropImage(null);
      setEditingImage(false);
    } catch (error) {
      console.error('Failed to upload cropped image:', error);
    } finally {
      setUploading(false);
    }
  }

  async function handleUpdateDescription() {
    try {
      await api.patch(`/groups/${id}`, { name: group.name, description: newDescription.trim() || null, imageUrl: group.imageUrl });
      await loadGroup();
      setEditingDescription(false);
    } catch (error) {
      console.error('Failed to update group description:', error);
    }
  }

  async function handleDeleteGroup() {
    try {
      await api.delete(`/groups/${id}`);
      navigate('/groups');
    } catch (error) {
      console.error('Failed to delete group:', error);
    }
  }

  async function loadAvailableUsers() {
    try {
      const allUsers = await api.get('/users');
      const memberIds = new Set(group.members.map(m => m.id));
      setAvailableUsers(allUsers.filter(u => !memberIds.has(u.id)));
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  }

  async function handleAddMembers(userIds) {
    try {
      await api.post(`/groups/${id}/members`, { userIds });
      await loadGroup();
      setShowAddMembers(false);
    } catch (error) {
      console.error('Failed to add members:', error);
    }
  }

  function handleRemoveMember(userId) {
    setConfirmModal({
      title: 'Remove Member',
      message: 'Remove this member from the group?',
      confirmText: 'Remove',
      destructive: true,
      onConfirm: async () => {
        try {
          await api.delete(`/groups/${id}/members/${userId}`);
          await loadGroup();
        } catch (error) {
          console.error('Failed to remove member:', error);
        }
        setConfirmModal(null);
      }
    });
  }

  async function handleCreateSchedule(e) {
    e.preventDefault();
    try {
      await api.post('/schedules', {
        groupId: parseInt(id),
        ...newSchedule
      });
      await loadGroup();
      setShowCreateSchedule(false);
    } catch (error) {
      console.error('Failed to create schedule:', error);
    }
  }

  function handleDeleteSchedule(scheduleId) {
    setConfirmModal({
      title: 'Delete Schedule',
      message: 'Delete this schedule?',
      confirmText: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await api.delete(`/schedules/${scheduleId}`);
          setSchedules(schedules.filter(s => s.id !== scheduleId));
        } catch (error) {
          console.error('Failed to delete schedule:', error);
        }
        setConfirmModal(null);
      }
    });
  }

  async function handleEditSchedule(e) {
    e.preventDefault();
    try {
      const updated = await api.patch(`/schedules/${editingSchedule.id}`, {
        name: editingSchedule.name,
        dayOfWeek: editingSchedule.dayOfWeek,
        time: editingSchedule.time,
        recurrenceType: editingSchedule.recurrenceType,
        advanceCount: editingSchedule.advanceCount
      });
      setSchedules(schedules.map(s => s.id === updated.id ? updated : s));
      setEditingSchedule(null);
      const nightsData = await api.get(`/schedules/movie-nights/group/${id}`);
      setMovieNights(nightsData);
    } catch (error) {
      console.error('Failed to update schedule:', error);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!group) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Group not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value.slice(0, 35))}
                onKeyDown={(e) => e.key === 'Enter' && handleUpdateGroupName()}
                maxLength={35}
                className="px-3 py-1 bg-gray-700 border border-gray-600 rounded-lg text-white text-xl focus:outline-none focus:border-indigo-500"
                autoFocus
              />
              <button
                onClick={handleUpdateGroupName}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg"
              >
                Save
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl text-white">{group.name}</h1>
              <button
                onClick={() => {
                  setNewGroupName(group.name);
                  setEditingName(true);
                }}
                className="p-1 text-gray-400 hover:text-indigo-400 transition-colors"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        <button
          onClick={() => setShowDeleteGroup(true)}
          className="px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Delete Group
        </button>
      </div>
      {editingDescription ? (
        <div className="flex items-start gap-2 mt-1">
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={2}
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm focus:outline-none focus:border-indigo-500 resize-none"
            placeholder="Add a description..."
            autoFocus
          />
          <button
            onClick={handleUpdateDescription}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg"
          >
            Save
          </button>
          <button
            onClick={() => setEditingDescription(false)}
            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-1">
          <p className="text-gray-400 text-sm">
            {group.description || 'No description'}
          </p>
          <button
            onClick={() => {
              setNewDescription(group.description || '');
              setEditingDescription(true);
            }}
            className="p-1 text-gray-500 hover:text-indigo-400 transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg text-white">Schedules</h2>
              <button
                onClick={() => setShowCreateSchedule(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Schedule
              </button>
            </div>

            {schedules.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No schedules yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {schedules.map((schedule) => (
                  <div key={schedule.id} className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-white">{schedule.name}</p>
                      <p className="text-sm text-gray-400">
                        {DAYS[schedule.dayOfWeek]} at {schedule.time} · {RECURRENCE_LABELS[schedule.recurrenceType] || 'Weekly'}
                        {schedule.recurrenceType !== 'none' && ` · ${schedule.advanceCount || 1} ahead`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingSchedule({ ...schedule })}
                        className="p-2 text-gray-400 hover:text-indigo-400 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSchedule(schedule.id)}
                        className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <div className="flex gap-4">
                <button
                  onClick={() => setShowHistory(false)}
                  className={`text-lg transition-colors ${!showHistory ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  Upcoming
                </button>
                <button
                  onClick={handleShowHistory}
                  className={`text-lg transition-colors ${showHistory ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  History {historyTotal > 0 && `(${historyTotal})`}
                </button>
              </div>
            </div>

            {!showHistory ? (
              movieNights.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No upcoming movie nights</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-700">
                  {movieNights.slice(0, 10).map((night) => (
                    <Link
                      key={night.id}
                      to={`/movie-night/${night.id}`}
                      className="px-6 py-4 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
                    >
                      <div>
                        <p className="text-white">
                          {format(parseISO(night.date), 'EEEE, MMM d, yyyy')}
                        </p>
                        <p className="text-sm text-gray-400">
                          {night.time} • {night.nominationCount || 0} nominations
                          {night.hostName && ` • Host: ${night.hostName}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {night.isCancelled && (
                          <span className="px-2 py-1 bg-red-600/20 text-red-400 text-xs rounded">
                            Cancelled
                          </span>
                        )}
                        {night.status === 'decided' && (
                          <span className="px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded">
                            Decided
                          </span>
                        )}
                        <ChevronRight className="h-5 w-5 text-gray-500" />
                      </div>
                    </Link>
                  ))}
                </div>
              )
            ) : (
              loadingHistory && historyNights.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
                </div>
              ) : historyNights.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No past movie nights</p>
                </div>
              ) : (
                <div>
                  <div className="divide-y divide-gray-700">
                    {historyNights.map((night) => (
                      <Link
                        key={night.id}
                        to={`/movie-night/${night.id}`}
                        className="px-6 py-4 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
                      >
                        <div>
                          <p className="text-white">
                            {format(parseISO(night.date), 'EEEE, MMM d, yyyy')}
                          </p>
                          <p className="text-sm text-gray-400">
                            {night.time}
                            {night.winningMovieTitle ? ` • Winner: ${night.winningMovieTitle}` : ' • No winner decided'}
                            {night.hostName && ` • Host: ${night.hostName}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {night.isCancelled && (
                            <span className="px-2 py-1 bg-red-600/20 text-red-400 text-xs rounded">
                              Cancelled
                            </span>
                          )}
                          <ChevronRight className="h-5 w-5 text-gray-500" />
                        </div>
                      </Link>
                    ))}
                  </div>
                  {historyHasMore && (
                    <div className="p-4 border-t border-gray-700">
                      <button
                        onClick={() => loadHistory(historyPage + 1)}
                        disabled={loadingHistory}
                        className="w-full py-2 text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                      >
                        {loadingHistory ? 'Loading...' : 'Load more'}
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg text-white">Group Image</h2>
              <button
                onClick={() => {
                  setNewImageUrl(group.imageUrl || '');
                  setEditingImage(true);
                }}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 flex justify-center">
              {group.imageUrl ? (
                <img 
                  src={group.imageUrl} 
                  alt={group.name}
                  className="w-32 h-32 rounded-xl object-cover"
                />
              ) : (
                <div className="w-32 h-32 bg-indigo-600/20 rounded-xl flex items-center justify-center">
                  <Users className="h-12 w-12 text-indigo-500" />
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg text-white">Settings</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Votes per user</label>
                <select
                  value={group.maxVotesPerUser}
                  onChange={async (e) => {
                    try {
                      await api.patch(`/groups/${id}`, { 
                        name: group.name,
                        description: group.description,
                        imageUrl: group.imageUrl,
                        maxVotesPerUser: parseInt(e.target.value) 
                      });
                      loadGroup();
                    } catch (err) {
                      console.error('Failed to update max votes:', err);
                    }
                  }}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <option key={n} value={n}>{n} vote{n !== 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm text-gray-400">Allow sharing</label>
                  <p className="text-xs text-gray-500">Enable invite links for movie nights</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await api.patch(`/groups/${id}`, { 
                        name: group.name,
                        description: group.description,
                        imageUrl: group.imageUrl,
                        sharingEnabled: !group.sharingEnabled 
                      });
                      loadGroup();
                    } catch (err) {
                      console.error('Failed to update sharing:', err);
                    }
                  }}
                  className={clsx(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    group.sharingEnabled ? "bg-indigo-600" : "bg-gray-600"
                  )}
                >
                  <span
                    className={clsx(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      group.sharingEnabled ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg text-white">Members</h2>
              <button
                onClick={() => {
                  loadAvailableUsers();
                  setShowAddMembers(true);
                }}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <UserPlus className="h-5 w-5" />
              </button>
            </div>

            <div className="divide-y divide-gray-700">
              {group.members.map((member) => (
                <div key={member.id} className="px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt={member.username}
                        className="h-8 w-8 rounded-full"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-gray-600 flex items-center justify-center text-sm text-white">
                        {member.username[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm text-white">{member.username}</p>
                        {member.role === 'admin' && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-600/30 text-indigo-300">Group Admin</span>
                        )}
                      </div>
                      <span className={clsx(
                        "px-1.5 py-0.5 text-[10px] rounded",
                        member.isLocal ? "bg-gray-600/50 text-gray-400" : "bg-orange-600/30 text-orange-300"
                      )}>
                        {member.isLocal ? 'Local' : 'Plex'}
                      </span>
                    </div>
                  </div>
                  {member.id !== user.id && member.role !== 'admin' && (
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showAddMembers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md max-h-[80vh] flex flex-col">
            <h2 className="text-xl text-white mb-4">Add Members</h2>
            
            {availableUsers.length === 0 ? (
              <p className="text-gray-400">No available users to add</p>
            ) : (
              <>
                <button
                  onClick={() => {
                    if (selectedUserIds.length === availableUsers.length) {
                      setSelectedUserIds([]);
                    } else {
                      setSelectedUserIds(availableUsers.map(u => u.id));
                    }
                  }}
                  className="mb-3 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  {selectedUserIds.length === availableUsers.length ? 'Deselect All' : 'Select All'}
                </button>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {availableUsers.map((u) => {
                    const isSelected = selectedUserIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedUserIds(selectedUserIds.filter(id => id !== u.id));
                          } else {
                            setSelectedUserIds([...selectedUserIds, u.id]);
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          isSelected 
                            ? 'bg-indigo-600/20 border border-indigo-600' 
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        <div className={`h-5 w-5 rounded border-2 flex items-center justify-center ${
                          isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-500'
                        }`}>
                          {isSelected && (
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt={u.username} className="h-8 w-8 rounded-full" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gray-600 flex items-center justify-center text-sm text-white">
                            {u.username[0].toUpperCase()}
                          </div>
                        )}
                        <div className="text-left">
                          <p className="text-white">{u.username}</p>
                          <p className="text-xs text-gray-400">{u.isLocal ? 'Local User' : 'Plex User'}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedUserIds.length > 0 && (
                  <button
                    onClick={() => {
                      handleAddMembers(selectedUserIds);
                      setSelectedUserIds([]);
                    }}
                    className="mt-4 w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                  >
                    Add {selectedUserIds.length} Member{selectedUserIds.length > 1 ? 's' : ''}
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => {
                setShowAddMembers(false);
                setSelectedUserIds([]);
              }}
              className="mt-4 w-full px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCreateSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl text-white mb-4">Create Schedule</h2>
            <form onSubmit={handleCreateSchedule} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newSchedule.name}
                  onChange={(e) => setNewSchedule({ ...newSchedule, name: e.target.value })}
                  className="w-full h-11 px-4 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Recurrence</label>
                <select
                  value={newSchedule.recurrenceType}
                  onChange={(e) => setNewSchedule({ ...newSchedule, recurrenceType: e.target.value })}
                  className="w-full h-11 px-4 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="none">One-time</option>
                </select>
              </div>
              {newSchedule.recurrenceType === 'none' ? (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Date</label>
                  <DatePicker
                    value={newSchedule.fixedDate}
                    onChange={(date) => setNewSchedule({ ...newSchedule, fixedDate: date })}
                    minDate={new Date().toISOString().split('T')[0]}
                    placeholder="Select date"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Day</label>
                    <select
                      value={newSchedule.dayOfWeek}
                      onChange={(e) => setNewSchedule({ ...newSchedule, dayOfWeek: parseInt(e.target.value) })}
                      className="w-full h-11 px-4 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    >
                      {DAYS.map((day, i) => (
                        <option key={i} value={i}>{day}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Movie nights ahead</label>
                    <select
                      value={newSchedule.advanceCount}
                      onChange={(e) => setNewSchedule({ ...newSchedule, advanceCount: parseInt(e.target.value) })}
                      className="w-full h-11 px-4 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Time</label>
                <input
                  type="time"
                  value={newSchedule.time}
                  onChange={(e) => setNewSchedule({ ...newSchedule, time: e.target.value })}
                  className="w-full h-11 px-4 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateSchedule(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl text-white mb-4">Edit Schedule</h2>
            <form onSubmit={handleEditSchedule} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={editingSchedule.name}
                  onChange={(e) => setEditingSchedule({ ...editingSchedule, name: e.target.value })}
                  className="w-full h-11 px-4 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Recurrence</label>
                <select
                  value={editingSchedule.recurrenceType || 'weekly'}
                  onChange={(e) => setEditingSchedule({ ...editingSchedule, recurrenceType: e.target.value })}
                  className="w-full h-11 px-4 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="none">One-time</option>
                </select>
              </div>
              {editingSchedule.recurrenceType !== 'none' && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Day</label>
                    <select
                      value={String(editingSchedule.dayOfWeek)}
                      onChange={(e) => setEditingSchedule({ ...editingSchedule, dayOfWeek: parseInt(e.target.value) })}
                      className="w-full h-11 px-4 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    >
                      {DAYS.map((day, i) => (
                        <option key={i} value={String(i)}>{day}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Movie nights ahead</label>
                    <select
                      value={editingSchedule.advanceCount || 1}
                      onChange={(e) => setEditingSchedule({ ...editingSchedule, advanceCount: parseInt(e.target.value) })}
                      className="w-full h-11 px-4 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Time</label>
                <input
                  type="time"
                  value={editingSchedule.time}
                  onChange={(e) => setEditingSchedule({ ...editingSchedule, time: e.target.value })}
                  className="w-full h-11 px-4 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingSchedule(null)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
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

      {editingImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl text-white mb-4">Group Image</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Upload Image</label>
                <label className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors">
                  <Upload className="h-5 w-5" />
                  Choose Image to Crop
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-600" />
                <span className="text-xs text-gray-500">or use URL</span>
                <div className="flex-1 h-px bg-gray-600" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Image URL</label>
                <input
                  type="url"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              {newImageUrl && (
                <div className="flex justify-center">
                  <img 
                    src={newImageUrl} 
                    alt="Preview"
                    className="w-24 h-24 rounded-xl object-cover"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setEditingImage(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateImage}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cropImage && (
        <ImageCropper
          image={cropImage}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropImage(null)}
          aspectRatio={1}
        />
      )}

      {showDeleteGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl text-white mb-2">Delete Group</h2>
            <p className="text-gray-400 mb-4">
              This will permanently delete the group, all schedules, movie nights, nominations, and votes. This action cannot be undone.
            </p>
            <p className="text-sm text-gray-300 mb-2">
              Type <span className="text-red-400">{group.name}</span> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={group.name}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500 mb-4"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteGroup(false);
                  setDeleteConfirmText('');
                }}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteGroup}
                disabled={deleteConfirmText !== group.name}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Delete Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
