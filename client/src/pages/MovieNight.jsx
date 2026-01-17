import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useVoting } from '../lib/useVoting';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { 
  Calendar, 
  Clock, 
  User, 
  Plus, 
  Check, 
  Eye, 
  EyeOff,
  Trophy,
  Link as LinkIcon,
  UserCheck,
  UserX,
  Users,
  Crown,
  Lock,
  Film
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';
import HostPicker from '../components/HostPicker';
import NominateModal from '../components/NominateModal';
import InviteModal from '../components/InviteModal';
import ConfirmModal from '../components/ConfirmModal';
import AnimatedList from '../components/AnimatedList';

export default function MovieNight() {
  const { id } = useParams();
  const { user } = useAuth();
  const { clearRankingCountdown } = useNotifications();
  const voting = useVoting(id);
  const [night, setNight] = useState(null);
  const [nominations, setNominations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNominate, setShowNominate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showHostPicker, setShowHostPicker] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [confirmModal, setConfirmModal] = useState(null);

  useEffect(() => {
    loadMovieNight();
    return () => clearRankingCountdown();
  }, [id]);

  async function loadMovieNight() {
    try {
      const [nightData, votesData] = await Promise.all([
        api.get(`/schedules/movie-nights/${id}`),
        api.get(`/votes/movie-night/${id}`)
      ]);
      setNight(nightData);
      setNominations(votesData.nominations);
      voting.initialize(votesData, nightData.winningMovieId);
    } catch (error) {
      console.error('Failed to load movie night:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleVote(nominationId) {
    voting.vote(nominationId);
  }

  function handleUnvote(nominationId) {
    voting.unvote(nominationId);
  }

  function handleUnnominate(nominationId) {
    setConfirmModal({
      title: 'Remove Nomination',
      message: 'Remove this nomination? All votes on it will be returned.',
      confirmText: 'Remove',
      destructive: true,
      onConfirm: async () => {
        try {
          await api.delete(`/votes/nominations/${nominationId}`);
          await loadMovieNight();
        } catch (error) {
          console.error('Unnominate failed:', error);
        }
        setConfirmModal(null);
      }
    });
  }

  async function handleBlockNomination(nominationId) {
    try {
      await api.post(`/votes/nomination/${nominationId}/block`);
      await loadMovieNight();
    } catch (error) {
      console.error('Block failed:', error);
    }
  }

  async function handleUnblockNomination(nominationId) {
    try {
      await api.delete(`/votes/nomination/${nominationId}/block`);
      await loadMovieNight();
    } catch (error) {
      console.error('Unblock failed:', error);
    }
  }

  async function handleSetHost(userId) {
    try {
      await api.patch(`/schedules/movie-nights/${id}`, { hostId: userId });
      await loadMovieNight();
    } catch (error) {
      console.error('Failed to set host:', error);
    }
  }

  async function handleSetAttendance(status) {
    try {
      await api.post(`/schedules/movie-nights/${id}/attendance`, { status });
      await loadMovieNight();
    } catch (error) {
      console.error('Failed to set attendance:', error);
    }
  }

  async function handleDecide(nominationId = null) {
    try {
      await api.post(`/votes/movie-night/${id}/decide`, { nominationId });
      await loadMovieNight();
    } catch (error) {
      console.error('Failed to decide winner:', error);
    }
  }

  async function handleUndecide() {
    try {
      await api.post(`/votes/movie-night/${id}/undecide`);
      await loadMovieNight();
    } catch (error) {
      console.error('Failed to undo winner:', error);
    }
  }

  async function handleCreateInvite() {
    try {
      const result = await api.post('/invites/create', { movieNightId: parseInt(id) });
      setInviteUrl(`${window.location.origin}${result.url}`);
      setShowInvite(true);
    } catch (error) {
      console.error('Failed to create invite:', error);
    }
  }

  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!night) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Movie night not found</p>
      </div>
    );
  }

  const isHost = night.hostId === user.id;
  const userAttendance = night.attendance?.find(a => a.userId === user.id);
  
  const nightDateTime = new Date(`${night.date}T${night.time || '20:00'}`);
  const isPast = nightDateTime < new Date();
  
  const isArchived = isPast || night.status === 'decided';
  const canVote = night.status === 'voting' && !night.isCancelled && !isPast;
  const canNominate = night.status === 'voting' && !night.isCancelled && !isPast;
  const winner = nominations.find(n => n.id === night.winningMovieId);

  
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex gap-4">
          {night.groupImageUrl && (
            <img src={night.groupImageUrl} alt="" className="w-14 h-14 md:w-16 md:h-16 rounded-xl object-cover flex-shrink-0" />
          )}
          <div className="flex-1 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl text-white">
                {night.scheduleName || 'Movie Night'}
              </h1>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-gray-400">
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {format(parseISO(night.date), 'EEEE, MMMM d, yyyy')}
                </span>
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {night.time}
                </span>
                {night.groupName && (
                  <span>{night.groupName}</span>
                )}
                {isPast && (
                <span className="flex items-center gap-2 text-gray-500">
                  <Lock className="h-4 w-4" />
                  Archived
                </span>
              )}
              {night.hostName ? (
                isArchived ? (
                  <span className="flex items-center gap-1">
                    <Crown className="h-4 w-4 text-purple-400" />
                    {night.hostName}
                  </span>
                ) : (
                  <button
                    onClick={() => setShowHostPicker(true)}
                    className="flex items-center gap-1 hover:text-indigo-400 transition-colors underline decoration-dotted underline-offset-2"
                  >
                    <Crown className="h-4 w-4 text-purple-400" />
                    {night.hostName}
                  </button>
                )
              ) : !isArchived && (
                <button
                  onClick={() => setShowHostPicker(true)}
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

            {!isArchived && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleSetAttendance('attending')}
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
                  onClick={() => handleSetAttendance('absent')}
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
                {!user.isLocalInvite && (
                  <button
                    onClick={handleCreateInvite}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors active:scale-95"
                  >
                    <LinkIcon className="h-5 w-5" />
                    Share
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-400 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Attendance ({night.attendance?.filter(a => a.status === 'attending').length || 0} attending)
            </p>
          </div>
          {night.attendance && night.attendance.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {night.attendance.map((a) => (
                <div
                  key={a.userId}
                  className={clsx(
                    "flex items-center gap-2 px-2 py-1 rounded-full text-xs",
                    a.status === 'attending' ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"
                  )}
                >
                  {a.avatarUrl ? (
                    <img src={a.avatarUrl} alt={a.username} className="h-4 w-4 rounded-full" />
                  ) : (
                    <div className="h-4 w-4 rounded-full bg-gray-600 flex items-center justify-center text-[10px]">
                      {a.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <span>{a.username}</span>
                  {a.status === 'attending' ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {winner && (
        <div className="bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-600/30 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Trophy className="h-6 w-6 text-yellow-500" />
              <h2 className="text-lg text-white">Winner</h2>
            </div>
            {(isHost || user.isAdmin) && !isArchived && (
              <button
                onClick={handleUndecide}
                className="text-sm text-gray-400 hover:text-white px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Undo winner
              </button>
            )}
          </div>
          <div className="flex gap-4">
            {winner.posterUrl && (
              <img
                src={winner.posterUrl}
                alt={winner.title}
                className="w-24 h-36 object-cover rounded-lg"
              />
            )}
            <div>
              <h3 className="text-xl text-white">{winner.title}</h3>
              <p className="text-gray-400">{winner.year}</p>
              <p className="text-sm text-gray-400 mt-2">
                {winner.voteCount} votes
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg text-white">
            Nominations ({nominations.length})
          </h2>
          {canNominate && (
            <button
              onClick={() => setShowNominate(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-700 text-white transition-colors active:scale-95"
            >
              <Plus className="h-5 w-5" />
              Nominate
            </button>
          )}
        </div>

        {nominations.length === 0 ? (
          <div className="p-12 text-center">
            <Film className="h-16 w-16 mx-auto mb-4 text-gray-600" />
            <p className="text-gray-400">No nominations yet</p>
            {canNominate && (
              <button
                onClick={() => setShowNominate(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-700 text-white transition-colors active:scale-95"
              >
                <Plus className="h-5 w-5" />
                Add First Nomination
              </button>
            )}
          </div>
        ) : (
          <AnimatedList className="divide-y divide-gray-700">
            {voting.sortedNominations.map((nomination, index) => {
              const topVoteCount = voting.sortedNominations[0]?.voteCount || 0;
              const isLeader = topVoteCount > 0 && nomination.voteCount === topVoteCount && !night.winningMovieId;
              return (
              <div
                key={nomination.id}
                className={clsx(
                  "p-4 md:p-6",
                  nomination.id === night.winningMovieId && "bg-yellow-600/10",
                  isLeader && "bg-indigo-600/10"
                )}
              >
                <div className="flex gap-4 md:gap-6">
                  <div className="relative flex-shrink-0">
                    {nomination.posterUrl ? (
                      <img
                        src={nomination.posterUrl}
                        alt={nomination.title}
                        className="w-28 sm:w-32 md:w-40 aspect-[2/3] object-cover rounded-xl shadow-lg"
                      />
                    ) : (
                      <div className="w-28 sm:w-32 md:w-40 aspect-[2/3] bg-gray-700 rounded-xl flex items-center justify-center">
                        <Film className="h-12 w-12 text-gray-500" />
                      </div>
                    )}
                    <div className={clsx(
                      "absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[10px] inline-flex items-center gap-1",
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

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-lg text-white">{nomination.title}</h3>
                        <p className="text-sm text-gray-400">
                          {nomination.year}
                          {nomination.runtime && ` • ${nomination.runtime} min`}
                        </p>
                      </div>
                      {nomination.id === night.winningMovieId && (
                        <Trophy className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                      )}
                      {isLeader && (
                        <span className="px-2 py-0.5 text-xs bg-indigo-600 text-white rounded">Leading</span>
                      )}
                    </div>

                    <p className="text-sm text-gray-500 mt-1">
                      Nominated by {nomination.nominatedBy.username}
                    </p>

                    {nomination.overview && (
                      <p className="text-sm text-gray-400 mt-2 line-clamp-2">
                        {nomination.overview}
                      </p>
                    )}

                    {nomination.watchedBy && nomination.watchedBy.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-500">Watched by:</span>
                        {nomination.watchedBy.map(w => (
                          <div key={w.userId} className="flex items-center gap-1 px-2 py-0.5 bg-gray-700/50 rounded-full text-xs">
                            {w.avatarUrl ? (
                              <img src={w.avatarUrl} alt={w.username} className="h-4 w-4 rounded-full" />
                            ) : (
                              <div className="h-4 w-4 rounded-full bg-gray-600 flex items-center justify-center text-[10px]">
                                {w.username[0].toUpperCase()}
                              </div>
                            )}
                            <span className="text-gray-300">{w.username}</span>
                          </div>
                        ))}
                        {nomination.watchedBy.some(w => w.userId === user.id) && canVote && !isArchived && (
                          nomination.userHasBlocked ? (
                            <button
                              onClick={() => handleUnblockNomination(nomination.id)}
                              className="px-2 py-0.5 bg-gray-600 text-gray-300 rounded-full text-xs hover:bg-gray-500 transition-colors"
                            >
                              Unblock
                            </button>
                          ) : (
                            <button
                              onClick={() => handleBlockNomination(nomination.id)}
                              className="px-2 py-0.5 bg-red-600/20 text-red-400 rounded-full text-xs hover:bg-red-600/30 transition-colors"
                            >
                              Block
                            </button>
                          )
                        )}
                      </div>
                    )}

                    {nomination.isBlocked && nomination.blockedBy && (
                      <div className="mt-2 px-3 py-1.5 bg-red-900/30 border border-red-800/50 rounded-lg">
                        <p className="text-xs text-red-400">
                          Watched and blocked by {nomination.blockedBy.map(b => b.username).join(', ')}
                        </p>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg text-white">{nomination.voteCount}</span>
                        <span className="text-sm text-gray-400">votes</span>
                      </div>

                      {canVote && !nomination.isBlocked && (
                        <div className="flex items-center gap-1 bg-gray-700/50 rounded-xl p-1.5">
                          <button
                            onClick={() => handleUnvote(nomination.id)}
                            disabled={nomination.userVoteCount === 0}
                            className={clsx(
                              "w-11 h-11 flex items-center justify-center rounded-lg transition-colors text-xl active:scale-95",
                              nomination.userVoteCount > 0 
                                ? "bg-red-600/30 text-red-400 hover:bg-red-600/50" 
                                : "text-gray-600 cursor-not-allowed"
                            )}
                          >
                            −
                          </button>
                          <span className={clsx(
                            "w-10 text-center text-base",
                            nomination.userVoteCount > 0 ? "text-indigo-400" : "text-gray-500"
                          )}>
                            {nomination.userVoteCount || 0}
                          </span>
                          <button
                            onClick={() => handleVote(nomination.id)}
                            disabled={voting.userRemainingVotes === 0}
                            className={clsx(
                              "w-11 h-11 flex items-center justify-center rounded-lg transition-colors text-xl active:scale-95",
                              voting.userRemainingVotes > 0 
                                ? "bg-indigo-600/30 text-indigo-400 hover:bg-indigo-600/50" 
                                : "text-gray-600 cursor-not-allowed"
                            )}
                          >
                            +
                          </button>
                        </div>
                      )}

                      {(isHost || user.isAdmin) && canNominate && !nomination.isBlocked && !isArchived && (
                        <button
                          onClick={() => handleDecide(nomination.id)}
                          className="h-11 flex items-center gap-2 px-4 bg-yellow-600/20 text-yellow-400 rounded-xl hover:bg-yellow-600/30 transition-colors text-sm active:scale-95"
                        >
                          <Trophy className="h-4 w-4" />
                          Pick Winner
                        </button>
                      )}
                    </div>

                    {nomination.votes.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {nomination.votes.map((vote) => (
                          <div
                            key={vote.userId}
                            className="flex items-center gap-1.5 px-2 py-1 bg-gray-700 rounded-full text-xs"
                          >
                            {vote.avatarUrl ? (
                              <img
                                src={vote.avatarUrl}
                                alt={vote.username}
                                className="h-4 w-4 rounded-full"
                              />
                            ) : (
                              <div className="h-4 w-4 rounded-full bg-gray-600 flex items-center justify-center text-[10px]">
                                {vote.username[0].toUpperCase()}
                              </div>
                            )}
                            <span className="text-gray-300">{vote.username}</span>
                            {vote.voteCount > 1 && (
                              <span className="text-indigo-400">×{vote.voteCount}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
            })}
          </AnimatedList>
        )}

        {canVote && (
          <div className="mt-6 p-4 bg-gray-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={clsx(
                "w-12 h-12 rounded-full flex items-center justify-center text-xl",
                voting.userRemainingVotes > 0 ? "bg-indigo-600/20 text-indigo-400" : "bg-gray-700 text-gray-500"
              )}>
                {voting.userRemainingVotes}
              </div>
              <div>
                <p className="text-white">Votes remaining</p>
                <p className="text-sm text-gray-400">You have {voting.userRemainingVotes} of {voting.maxVotesPerUser} votes left to distribute</p>
              </div>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: voting.maxVotesPerUser }, (_, i) => (
                <div
                  key={i}
                  className={clsx(
                    "w-3 h-3 rounded-full",
                    i < (voting.maxVotesPerUser - voting.userRemainingVotes) ? "bg-indigo-500" : "bg-gray-600"
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {showNominate && (
        <NominateModal
          movieNightId={parseInt(id)}
          existingNominations={nominations}
          onNominate={loadMovieNight}
          onClose={() => setShowNominate(false)}
        />
      )}

      {showInvite && (
        <InviteModal
          inviteUrl={inviteUrl}
          onClose={() => setShowInvite(false)}
        />
      )}

      {showHostPicker && (
        <HostPicker
          members={night.members}
          currentHostId={night.hostId}
          onSelect={(userId) => {
            handleSetHost(userId);
            setShowHostPicker(false);
          }}
          onClose={() => setShowHostPicker(false)}
        />
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
