import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useMultiVoting } from '../lib/useVoting';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import Tooltip from '../components/Tooltip';
import { 
  Calendar, 
  Users, 
  ChevronRight, 
  Trophy,
  UserCheck,
  UserX,
  Check,
  Plus,
  Clock,
  Crown,
  Eye,
  EyeOff,
  Link as LinkIcon,
  Film,
  XCircle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';
import HostPicker from '../components/HostPicker';
import NominateModal from '../components/NominateModal';
import InviteModal from '../components/InviteModal';
import AnimatedList from '../components/AnimatedList';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Dashboard() {
  const { user } = useAuth();
  const { clearRankingCountdown } = useNotifications();
  const voting = useMultiVoting();
  const [groups, setGroups] = useState([]);
  const [movieNights, setMovieNights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNominate, setShowNominate] = useState(false);
  const [nominateNightId, setNominateNightId] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteNightId, setInviteNightId] = useState(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [showHostPicker, setShowHostPicker] = useState(false);
  const [hostPickerNightId, setHostPickerNightId] = useState(null);

  useEffect(() => {
    loadData();
    return () => clearRankingCountdown();
  }, []);

  function getSortedNominations(night) {
    const sorted = voting.getSorted(night.id);
    return sorted.length ? sorted : [...(night.nominations || [])].sort((a, b) => b.voteCount - a.voteCount);
  }

  function getVotingData(night) {
    const data = voting.getData(night.id);
    return {
      userRemainingVotes: data.userRemainingVotes ?? night.userRemainingVotes ?? 0,
      maxVotesPerUser: data.maxVotesPerUser ?? night.maxVotesPerUser ?? 3
    };
  }

  async function loadData() {
    try {
      const data = await api.get('/dashboard');
      setGroups(data.groups);
      
      data.movieNights.forEach(night => {
        voting.initialize(night.id, { 
          nominations: night.nominations, 
          userRemainingVotes: night.userRemainingVotes, 
          maxVotesPerUser: night.maxVotesPerUser 
        });
      });
      
      setMovieNights(data.movieNights);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetAttendance(nightId, status) {
    try {
      await api.post(`/schedules/movie-nights/${nightId}/attendance`, { status });
      await loadData();
    } catch (error) {
      console.error('Failed to set attendance:', error);
    }
  }

  function handleVote(nominationId, nightId) {
    voting.vote(nominationId, nightId);
  }

  function handleUnvote(nominationId, nightId) {
    voting.unvote(nominationId, nightId);
  }

  async function handleUndecide(nightId) {
    try {
      await api.post(`/votes/movie-night/${nightId}/undecide`);
      await loadData();
    } catch (error) {
      console.error('Undecide failed:', error);
    }
  }

  async function handleDecide(nightId, nominationId = null) {
    try {
      await api.post(`/votes/movie-night/${nightId}/decide`, { nominationId });
      await loadData();
    } catch (error) {
      console.error('Failed to decide winner:', error);
    }
  }

  async function handleCreateInvite(nightId) {
    try {
      const result = await api.post('/invites/create', { movieNightId: nightId });
      setInviteUrl(`${window.location.origin}${result.url}`);
      setInviteNightId(nightId);
      setShowInvite(true);
    } catch (error) {
      console.error('Failed to create invite:', error);
    }
  }

  async function handleSetHost(nightId, userId) {
    try {
      await api.patch(`/schedules/movie-nights/${nightId}`, { hostId: userId });
      await loadData();
      setShowHostPicker(false);
      setHostPickerNightId(null);
    } catch (error) {
      console.error('Failed to set host:', error);
    }
  }

  
  function getUserAttendance(night) {
    return night.attendance?.find(a => a.userId === user.id);
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-white mb-1">Dashboard</h1>
        <p className="text-gray-400 text-sm">Your upcoming movie nights at a glance</p>
      </div>

      {movieNights.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-lg">No upcoming movie nights</p>
          <p className="text-gray-500 text-sm mt-1">
            {groups.length > 0 ? 'Schedule a movie night in one of your groups' : 'Create a group and schedule to get started'}
          </p>
          {groups.length > 0 ? (
            <Link
              to={`/groups/${groups[0].id}`}
              className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              <Calendar className="h-5 w-5" />
              Schedule Movie Night
            </Link>
          ) : (
            <Link
              to="/groups"
              className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              <Users className="h-5 w-5" />
              Create a Group
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {movieNights.map((night) => {
            const userAttendance = getUserAttendance(night);
            const sortedNominations = getSortedNominations(night);
            const votingData = getVotingData(night);
            const isAttending = userAttendance?.status === 'attending';
            const currentNominations = night.nominations?.filter(n => n.id !== night.winningMovieId) || [];

            return (
              <div key={night.id} className="bg-gray-800 rounded-xl overflow-hidden">
                <div className="p-4 md:p-6 border-b border-gray-700">
                  <div className="flex gap-4">
                    {night.groupImageUrl && (
                      <img src={night.groupImageUrl} alt="" className="w-14 h-14 md:w-16 md:h-16 rounded-xl object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <Link to={`/movie-night/${night.id}`} className="text-lg text-white hover:text-indigo-400 transition-colors">
                          {night.scheduleName || 'Movie Night'}
                        </Link>
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-gray-400">
                          <span className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {format(parseISO(night.date), 'EEEE, MMMM d, yyyy')}
                          </span>
                          <span className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            {night.time}
                          </span>
                          <span>{night.groupName}</span>
                        {night.hostName ? (
                          night.isCancelled ? (
                            <span className="flex items-center gap-1">
                              <Crown className="h-4 w-4 text-purple-400" />
                              {night.hostName}
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setHostPickerNightId(night.id);
                                setShowHostPicker(true);
                              }}
                              className="flex items-center gap-1 hover:text-indigo-400 transition-colors underline decoration-dotted underline-offset-2"
                            >
                              <Crown className="h-4 w-4 text-purple-400" />
                              {night.hostName}
                            </button>
                          )
                        ) : !night.isCancelled && (
                          <button
                            onClick={() => {
                              setHostPickerNightId(night.id);
                              setShowHostPicker(true);
                            }}
                            className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors underline decoration-dotted underline-offset-2"
                          >
                            <Crown className="h-4 w-4" />
                            Set host
                          </button>
                        )}
                        </div>
                        {night.groupDescription && (
                          <p className="text-sm text-gray-500 mt-1">{night.groupDescription}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                      {!night.isCancelled && (
                        <>
                        <button
                          onClick={() => handleSetAttendance(night.id, 'attending')}
                          className={clsx(
                            "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm transition-colors active:scale-95",
                            userAttendance?.status === 'attending'
                              ? "bg-green-600 text-white"
                              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          )}
                        >
                          <UserCheck className="h-5 w-5" />
                          Attending
                        </button>
                        <button
                          onClick={() => handleSetAttendance(night.id, 'absent')}
                          className={clsx(
                            "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm transition-colors active:scale-95",
                            userAttendance?.status === 'absent'
                              ? "bg-red-600 text-white"
                              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          )}
                        >
                          <UserX className="h-5 w-5" />
                          Absent
                        </button>
                        </>
                      )}
                      <button
                        onClick={() => handleCreateInvite(night.id)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors active:scale-95"
                      >
                        <LinkIcon className="h-5 w-5" />
                        Share
                      </button>
                      </div>
                    </div>
                  </div>

                  {night.attendance && night.attendance.length > 0 && (
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {night.attendance.filter(a => a.status === 'attending').length} attending:
                      </span>
                      <div className="flex -space-x-2">
                        {night.attendance.filter(a => a.status === 'attending').slice(0, 8).map((a) => (
                          <Tooltip key={a.userId} content={a.username}>
                            {a.avatarUrl ? (
                              <img
                                src={a.avatarUrl}
                                alt={a.username}
                                className="h-6 w-6 rounded-full border-2 border-gray-800"
                              />
                            ) : (
                              <div className="h-6 w-6 rounded-full border-2 border-gray-800 bg-gray-600 flex items-center justify-center text-[10px] text-white">
                                {a.username?.[0]?.toUpperCase()}
                              </div>
                            )}
                          </Tooltip>
                        ))}
                      </div>
                      {night.attendance.filter(a => a.status === 'absent').length > 0 && (
                        <div className="flex items-center gap-1 ml-2">
                          <div className="flex -space-x-2">
                            {night.attendance.filter(a => a.status === 'absent').slice(0, 4).map((a) => (
                              <Tooltip key={a.userId} content={a.username}>
                                {a.avatarUrl ? (
                                  <img
                                    src={a.avatarUrl}
                                    alt={a.username}
                                    className="h-5 w-5 rounded-full border-2 border-gray-800 opacity-50"
                                  />
                                ) : (
                                  <div className="h-5 w-5 rounded-full border-2 border-gray-800 bg-gray-600 flex items-center justify-center text-[9px] text-white opacity-50">
                                    {a.username?.[0]?.toUpperCase()}
                                  </div>
                                )}
                              </Tooltip>
                            ))}
                          </div>
                          <span className="text-xs text-gray-500">
                            {night.attendance.filter(a => a.status === 'absent').length} absent
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {night.isCancelled ? (
                  <div className="p-4 md:p-6 bg-red-900/20 border-t border-red-800/50">
                    <div className="text-center py-4">
                      <XCircle className="h-10 w-10 mx-auto mb-2 text-red-500" />
                      <p className="text-red-400">This movie night has been cancelled</p>
                      {night.cancelReason && (
                        <p className="mt-2 text-gray-500 italic">"{night.cancelReason}"</p>
                      )}
                      <Link
                        to={`/movie-night/${night.id}`}
                        className="mt-3 inline-block text-sm text-indigo-400 hover:text-indigo-300"
                      >
                        View details to restore
                      </Link>
                    </div>
                  </div>
                ) : night.winner ? (
                  <div className="p-4 md:p-6 bg-gradient-to-r from-yellow-600/10 to-orange-600/10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-yellow-500" />
                        <span className="text-sm text-yellow-400">Winner</span>
                      </div>
                      {night.canManage && (
                        <button
                          onClick={() => handleUndecide(night.id)}
                          className="text-xs text-gray-400 hover:text-white px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                        >
                          Undo winner
                        </button>
                      )}
                    </div>
                    <div className="flex gap-4">
                      {night.winner.posterUrl && (
                        <img
                          src={night.winner.posterUrl}
                          alt={night.winner.title}
                          className="w-16 h-24 object-cover rounded-lg"
                        />
                      )}
                      <div>
                        <h3 className="text-white text-lg">{night.winner.title}</h3>
                        <p className="text-gray-400 text-sm">{night.winner.year}</p>
                        <p className="text-gray-500 text-sm mt-1">{night.winner.voteCount} votes</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 md:p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-400">
                          {currentNominations.length} nominations
                        </span>
                        {night.canVote && (
                          <span className="text-xs text-gray-500">
                            {votingData.userRemainingVotes}/{votingData.maxVotesPerUser} votes left
                          </span>
                        )}
                      </div>
                      {night.canNominate && (
                        <button
                          onClick={() => {
                            setNominateNightId(night.id);
                            setShowNominate(true);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-700 text-white transition-colors active:scale-95"
                        >
                          <Plus className="h-5 w-5" />
                          Nominate
                        </button>
                      )}
                    </div>

                    {currentNominations.length === 0 ? (
                      <div className="text-center py-6">
                        <Film className="h-10 w-10 mx-auto mb-2 text-gray-600" />
                        <p className="text-gray-500 text-sm">No nominations yet</p>
                        {night.canNominate && (
                          <button
                            onClick={() => {
                              setNominateNightId(night.id);
                              setShowNominate(true);
                            }}
                            className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm"
                          >
                            Be the first to nominate a movie
                          </button>
                        )}
                      </div>
                    ) : (
                      <AnimatedList className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {sortedNominations.map((nomination, index) => {
                          return (
                          <div
                            key={nomination.id}
                            className={clsx(
                              "bg-gray-700/50 rounded-xl p-2 flex flex-col",
                              nomination.isLeading && "ring-2 ring-indigo-500"
                            )}
                          >
                            <div className="relative rounded-lg overflow-hidden">
                              {nomination.posterUrl ? (
                                <img
                                  src={nomination.posterUrl}
                                  alt={nomination.title}
                                  className="w-full aspect-[2/3] object-cover"
                                />
                              ) : (
                                <div className="w-full aspect-[2/3] bg-gray-700 flex items-center justify-center">
                                  <Film className="h-8 w-8 text-gray-500" />
                                </div>
                              )}
                              
                              {nomination.id === night.winningMovieId && (
                                <div className="absolute top-1 right-1 p-1.5 bg-yellow-500 rounded-full">
                                  <Trophy className="h-3 w-3 text-white" />
                                </div>
                              )}

                              {nomination.isLeading && (
                                <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-indigo-600 text-white text-[10px] rounded">
                                  Leading
                                </div>
                              )}

                              <div className={clsx(
                                "absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[10px] inline-flex items-center gap-1",
                                nomination.mediaType === 'plex' 
                                  ? "bg-black/60 text-orange-400" 
                                  : "bg-black/60 text-blue-400"
                              )} style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                                <span className={clsx(
                                  "w-1.5 h-1.5 rounded-full",
                                  nomination.mediaType === 'plex' ? "bg-orange-400" : "bg-blue-400"
                                )} />
                                {nomination.mediaType === 'plex' ? 'Plex' : 'TMDB'}
                              </div>
                            </div>

                            <div className="mt-2 flex-1">
                              <p className="text-white text-sm truncate">{nomination.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={clsx(
                                  "px-2.5 py-1 rounded text-sm",
                                  nomination.voteCount > 0 ? "bg-indigo-600/30 text-indigo-300" : "bg-gray-600/30 text-gray-400"
                                )}>
                                  {nomination.voteCount} {nomination.voteCount === 1 ? 'vote' : 'votes'}
                                </span>
                              </div>
                              
                              {nomination.watchedBy && nomination.watchedBy.length > 0 && (
                                <p className="text-[10px] text-gray-500 mt-1">
                                  Watched by {nomination.watchedBy.map(w => w.username).join(', ')}
                                </p>
                              )}
                            </div>

                            {night.canVote && !nomination.isBlocked && (
                              <div className="mt-2 flex items-center justify-between">
                                <div className="flex items-center gap-0.5 bg-gray-800 rounded-lg p-0.5">
                                  <button
                                    onClick={() => handleUnvote(nomination.id, night.id)}
                                    disabled={nomination.userVoteCount === 0}
                                    className={clsx(
                                      "w-7 h-7 flex items-center justify-center rounded-md transition-colors text-sm active:scale-95",
                                      nomination.userVoteCount > 0 
                                        ? "bg-red-600/40 text-red-400 hover:bg-red-600/60" 
                                        : "text-gray-600 cursor-not-allowed"
                                    )}
                                  >
                                    −
                                  </button>
                                  <span className={clsx(
                                    "w-5 text-center text-xs",
                                    nomination.userVoteCount > 0 ? "text-indigo-400" : "text-gray-500"
                                  )}>
                                    {nomination.userVoteCount || 0}
                                  </span>
                                  <button
                                    onClick={() => handleVote(nomination.id, night.id)}
                                    disabled={votingData.userRemainingVotes === 0}
                                    className={clsx(
                                      "w-7 h-7 flex items-center justify-center rounded-md transition-colors text-sm active:scale-95",
                                      votingData.userRemainingVotes > 0 
                                        ? "bg-indigo-600/40 text-indigo-400 hover:bg-indigo-600/60" 
                                        : "text-gray-600 cursor-not-allowed"
                                    )}
                                  >
                                    +
                                  </button>
                                </div>
                                {night.canNominate && night.canManage && nomination.id !== night.winningMovieId && (
                                  <Tooltip content="Pick as winner">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDecide(night.id, nomination.id); }}
                                      className="w-7 h-7 flex items-center justify-center bg-yellow-600/20 hover:bg-yellow-600/40 rounded-md transition-colors active:scale-95"
                                    >
                                      <Trophy className="h-3.5 w-3.5 text-yellow-400" />
                                    </button>
                                  </Tooltip>
                                )}
                              </div>
                            )}
                            {nomination.isBlocked && nomination.blockedBy && (
                              <div className="mt-2 px-2 py-1 bg-red-900/30 border border-red-800/50 rounded text-[10px] text-red-400">
                                Watched & blocked
                              </div>
                            )}
                          </div>
                        );
                        })}
                      </AnimatedList>
                    )}
                  </div>
                )}

                <div className="px-4 md:px-6 py-3 bg-gray-700/30 border-t border-gray-700">
                  <Link
                    to={`/movie-night/${night.id}`}
                    className="flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    View full details
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {groups.length > 0 && (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-lg text-white">Your Groups</h2>
            <Link to="/groups" className="text-sm text-indigo-400 hover:text-indigo-300">
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-700">
            {groups.slice(0, 3).map((group) => (
              <Link
                key={group.id}
                to={`/groups/${group.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-indigo-600/20 rounded-lg">
                    <Users className="h-5 w-5 text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-white">{group.name}</p>
                    <p className="text-sm text-gray-400">{group.memberCount} members</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-500" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {showNominate && nominateNightId && (
        <NominateModal
          movieNightId={nominateNightId}
          existingNominations={movieNights.find(n => n.id === nominateNightId)?.nominations || []}
          onNominate={loadData}
          onClose={() => {
            setShowNominate(false);
            setNominateNightId(null);
          }}
        />
      )}

      {showHostPicker && hostPickerNightId && (
        <HostPicker
          members={movieNights.find(n => n.id === hostPickerNightId)?.members}
          currentHostId={movieNights.find(n => n.id === hostPickerNightId)?.hostId}
          onSelect={(userId) => handleSetHost(hostPickerNightId, userId)}
          onClose={() => {
            setShowHostPicker(false);
            setHostPickerNightId(null);
          }}
        />
      )}

      {showInvite && (
        <InviteModal
          inviteUrl={inviteUrl}
          onClose={() => {
            setShowInvite(false);
            setInviteUrl('');
          }}
        />
      )}
    </div>
  );
}
