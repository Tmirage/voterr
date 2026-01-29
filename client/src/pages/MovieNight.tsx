import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useVoting } from '../lib/useVoting';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import {
  Plus,
  Trophy,
  Link as LinkIcon,
  UserCheck,
  UserX,
  Users,
  Lock,
  Film,
  XCircle,
  RotateCcw,
  Play,
} from 'lucide-react';
import clsx from 'clsx';
import HostPicker from '../components/HostPicker';
import NominateModal from '../components/NominateModal';
import InviteModal from '../components/InviteModal';
import ConfirmModal from '../components/ConfirmModal';
import AnimatedList from '../components/AnimatedList';
import LoadingSpinner from '../components/LoadingSpinner';
import Tooltip from '../components/Tooltip';
import MovieNightCountdown from '../components/MovieNightCountdown';
import MemberStatusList from '../components/MemberStatusList';

interface MovieNightNomination {
  id: number;
  title: string;
  year: number;
  posterUrl: string | null;
  voteCount: number;
  userVoteCount: number;
  voteAverage: number;
  overview: string;
  nominatedBy: { id: number; username: string };
  watchedBy: Array<{ userId: number; username: string; avatarUrl?: string | null }>;
  blockedBy: Array<{ userId: number; username: string }>;
  votes: Array<{
    id: number;
    userId: number;
    username: string;
    avatarUrl?: string | null;
    voteCount?: number;
  }>;
  [key: string]: unknown;
}

export default function MovieNight() {
  const { id } = useParams();
  const { user } = useAuth();
  const voting = useVoting(Number(id));
  const votingRef = useRef(voting);
  votingRef.current = voting;
  const [night, setNight] = useState<{
    id: number;
    groupId: number;
    groupName: string;
    groupDescription: string | null;
    groupImageUrl: string | null;
    scheduleName: string | null;
    date: string;
    time: string;
    status: string;
    winningMovieId: number | null;
    hostId: number | null;
    hostName: string | null;
    canVote: boolean;
    canNominate: boolean;
    canManage: boolean;
    canChangeHost: boolean;
    sharingEnabled: boolean;
    isCancelled: boolean;
    isArchived: boolean;
    cancelReason: string | null;
    members: Array<{ id: number; username: string; avatarUrl: string | null }>;
    attendance: Array<{ id: number; userId: number; status: string }>;
    userAttendance: string | null;
  } | null>(null);
  const [nominations, setNominations] = useState<MovieNightNomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNominate, setShowNominate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showHostPicker, setShowHostPicker] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteId, setInviteId] = useState<number | null>(null);
  const [votesData, setVotesData] = useState<{
    nominations: MovieNightNomination[];
    userRemainingVotes: number;
    maxVotesPerUser: number;
    isLocked?: boolean;
    canVote?: boolean;
    canNominate?: boolean;
    winner?: MovieNightNomination | null;
    memberVotingStatus?: Array<{
      id: number;
      username: string;
      avatarUrl?: string | null;
      votingComplete?: boolean;
      votesUsed?: number;
      maxVotes?: number;
    }>;
  } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: (input?: string) => void;
    destructive?: boolean;
    confirmText?: string;
    inputLabel?: string;
    inputPlaceholder?: string;
  } | null>(null);

  const loadMovieNight = useCallback(
    async (isPolling = false) => {
      try {
        const nightData = await api.get<{
          id: number;
          groupId: number;
          groupName: string;
          groupDescription: string | null;
          groupImageUrl: string | null;
          scheduleName: string | null;
          date: string;
          time: string;
          status: string;
          winningMovieId: number | null;
          hostId: number | null;
          hostName: string | null;
          canVote: boolean;
          canNominate: boolean;
          canManage: boolean;
          canChangeHost: boolean;
          sharingEnabled: boolean;
          isCancelled: boolean;
          isArchived: boolean;
          cancelReason: string | null;
          members: Array<{ id: number; username: string; avatarUrl: string | null }>;
          attendance: Array<{ id: number; userId: number; status: string }>;
          userAttendance: string | null;
        }>(`/schedules/movie-nights/${id}`);
        setNight(nightData);

        if (!isPolling) {
          const votesResult = await api.get<{
            nominations: MovieNightNomination[];
            userRemainingVotes: number;
            maxVotesPerUser: number;
          }>(`/votes/movie-night/${id}`);
          setNominations(votesResult.nominations);
          setVotesData(votesResult);
          votingRef.current.initialize(votesResult, nightData.winningMovieId);
        }
      } catch (err: unknown) {
        console.error('Failed to load movie night:', err);
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    loadMovieNight();

    const interval = setInterval(() => {
      loadMovieNight(true);
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [loadMovieNight]);

  function handleVote(nominationId: number) {
    voting.vote(nominationId);
  }

  function handleUnvote(nominationId: number) {
    voting.unvote(nominationId);
  }

  function handleUnnominate(nominationId: number) {
    setConfirmModal({
      title: 'Remove Nomination',
      message: 'Remove this nomination? All votes on it will be returned.',
      confirmText: 'Remove',
      destructive: true,
      onConfirm: async () => {
        try {
          await api.delete(`/votes/nominations/${nominationId}`);
          await loadMovieNight();
        } catch (err: unknown) {
          console.error('Unnominate failed:', err);
        }
        setConfirmModal(null);
      },
    });
  }

  async function handleBlockNomination(nominationId: number) {
    try {
      await api.post(`/votes/nomination/${nominationId}/block`);
      await loadMovieNight();
    } catch (err: unknown) {
      console.error('Block failed:', err);
    }
  }

  async function handleUnblockNomination(nominationId: number) {
    try {
      await api.delete(`/votes/nomination/${nominationId}/block`);
      await loadMovieNight();
    } catch (err: unknown) {
      console.error('Unblock failed:', err);
    }
  }

  async function handleSetHost(userId: number | null) {
    try {
      await api.patch(`/schedules/movie-nights/${id}`, { hostId: userId });
      await loadMovieNight();
    } catch (err: unknown) {
      console.error('Failed to set host:', err);
    }
  }

  async function handleSetAttendance(status: string) {
    try {
      await api.post(`/schedules/movie-nights/${id}/attendance`, { status });
      await loadMovieNight();
    } catch (err: unknown) {
      console.error('Failed to set attendance:', err);
    }
  }

  async function handleCancel(reason?: string) {
    try {
      await api.patch(`/schedules/movie-nights/${id}`, {
        isCancelled: true,
        cancelReason: reason || null,
      });
      setNight((prev) => ({ ...prev, isCancelled: true, cancelReason: reason || null }));
    } catch (err: unknown) {
      console.error('Failed to cancel:', err);
    }
  }

  async function handleUncancel() {
    try {
      await api.patch(`/schedules/movie-nights/${id}`, { isCancelled: false });
      setNight((prev) => ({ ...prev, isCancelled: false }));
    } catch (err: unknown) {
      console.error('Failed to uncancel:', err);
    }
  }

  async function handleDecide(nominationId: number | null = null) {
    try {
      await api.post(`/votes/movie-night/${id}/decide`, { nominationId });
      await loadMovieNight();
    } catch (err: unknown) {
      console.error('Failed to decide winner:', err);
    }
  }

  async function handleUndecide() {
    try {
      await api.post(`/votes/movie-night/${id}/undecide`);
      await loadMovieNight();
    } catch (err: unknown) {
      console.error('Failed to undo winner:', err);
    }
  }

  async function handleCreateInvite() {
    try {
      const result = await api.post<{ url: string; id: number }>('/invites/create', {
        movieNightId: parseInt(id as string),
      });
      setInviteUrl(`${window.location.origin}${result.url}`);
      setInviteId(result.id || null);
      setShowInvite(true);
    } catch (err: unknown) {
      console.error('Failed to create invite:', err);
    }
  }

  async function handleRefreshInvite(invId: number) {
    try {
      const result = await api.post<{ url: string; id: number }>(`/invites/refresh/${invId}`);
      setInviteUrl(`${window.location.origin}${result.url}`);
      setInviteId(result.id);
    } catch (err: unknown) {
      console.error('Failed to refresh invite:', err);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!night) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Movie night not found</p>
      </div>
    );
  }

  const userAttendance = night.attendance?.find((a) => a.userId === user.id);

  const { isLocked, canVote, canNominate, winner } = votesData || {};
  const isArchived = night.isArchived;

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-4 sm:p-6">
        {night.groupImageUrl && (
          <img
            src={night.groupImageUrl}
            alt=""
            className="w-full h-32 sm:hidden rounded-xl object-cover mb-4"
          />
        )}
        <div className="flex gap-4">
          {night.groupImageUrl && (
            <img
              src={night.groupImageUrl}
              alt=""
              className="hidden sm:block w-14 h-14 md:w-16 md:h-16 rounded-xl object-cover flex-shrink-0"
            />
          )}
          <div className="flex-1 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <MovieNightCountdown
                title={night.scheduleName || 'Movie Night'}
                date={night.date}
                time={night.time}
                hostName={night.hostName}
                onHostClick={() => setShowHostPicker(true)}
                canChangeHost={night.canChangeHost && !isLocked && !night.isCancelled}
                groupName={night.groupName}
                groupDescription={night.groupDescription}
              />
              {isArchived && !night.isCancelled && (
                <div className="mt-2 flex items-center gap-2 text-gray-500 text-sm">
                  <Lock className="h-4 w-4" />
                  Archived
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isLocked && (
                <>
                  <button
                    onClick={() => handleSetAttendance('attending')}
                    className={clsx(
                      'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm transition-colors active:scale-95',
                      userAttendance?.status === 'attending'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    )}
                  >
                    <UserCheck className="h-5 w-5" />
                    Attending
                  </button>
                  <button
                    onClick={() => handleSetAttendance('absent')}
                    className={clsx(
                      'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm transition-colors active:scale-95',
                      userAttendance?.status === 'absent'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    )}
                  >
                    <UserX className="h-5 w-5" />
                    Absent
                  </button>
                </>
              )}
              {!user.isLocalInvite && night.sharingEnabled && (
                <button
                  onClick={handleCreateInvite}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors active:scale-95"
                >
                  <LinkIcon className="h-5 w-5" />
                  Share
                </button>
              )}
            </div>
          </div>
        </div>

        {votesData?.memberVotingStatus && votesData.memberVotingStatus.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-400 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Member Status (
                {night.attendance?.filter((a) => a.status === 'attending').length || 0} attending)
              </p>
            </div>
            <MemberStatusList
              members={votesData.memberVotingStatus}
              attendance={night.attendance}
              canManage={night.canManage}
              onSetAttendance={async (userId, status) => {
                try {
                  await api.post(`/schedules/movie-nights/${night.id}/attendance/${userId}`, {
                    status,
                  });
                  await loadMovieNight(true);
                } catch (err: unknown) {
                  console.error('Failed to set attendance:', err);
                }
              }}
            />
          </div>
        )}
      </div>

      {night.isCancelled && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-8 text-center">
          <XCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl text-red-400 mb-2">Movie Night Cancelled</h2>
          <p className="text-gray-400">This movie night has been cancelled. Voting is disabled.</p>
          {night.cancelReason && (
            <p className="mt-2 text-gray-500 italic">"{night.cancelReason}"</p>
          )}
          {night.canManage && !isArchived && (
            <button
              onClick={() =>
                setConfirmModal({
                  title: 'Restore Movie Night',
                  message:
                    'Are you sure you want to restore this movie night? Voting will be re-enabled.',
                  confirmText: 'Restore',
                  destructive: false,
                  onConfirm: async () => {
                    await handleUncancel();
                    setConfirmModal(null);
                  },
                })
              }
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm bg-green-600 hover:bg-green-700 text-white transition-colors"
            >
              <RotateCcw className="h-5 w-5" />
              Restore Movie Night
            </button>
          )}
        </div>
      )}

      {!night.isCancelled && winner && (
        <div className="bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-600/30 rounded-xl p-6 relative">
          {night.canManage && !isLocked && (
            <button
              onClick={handleUndecide}
              className="absolute top-2 right-2 z-10 text-sm text-gray-400 hover:text-white px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Undo winner
            </button>
          )}
          <div className="flex gap-4">
            {winner.posterUrl && (
              <img
                src={winner.posterUrl}
                alt={winner.title}
                className="w-24 h-36 object-cover rounded-lg"
                loading="lazy"
                decoding="async"
              />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-5 w-5 text-yellow-500" />
                <span className="text-sm text-yellow-400">Winner</span>
              </div>
              <h3 className="text-xl text-white">{winner.title}</h3>
              <p className="text-gray-400">
                {winner.year}
                {winner.voteAverage && (
                  <span className="ml-2 text-yellow-400">TMDB {winner.voteAverage.toFixed(1)}</span>
                )}
              </p>
              <p className="text-sm text-gray-400 mt-2">{winner.voteCount} votes</p>
            </div>
          </div>
          {winner.ratingKey && voting.plexServerId && !user.isLocal && !user.isLocalInvite && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <a
                href={`https://app.plex.tv/desktop/#!/server/${voting.plexServerId}/details?key=%2Flibrary%2Fmetadata%2F${winner.ratingKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto flex items-center gap-3 px-8 py-4 bg-orange-500 hover:bg-orange-600 text-white text-xl rounded-xl transition-colors shadow-xl"
              >
                <Play className="h-10 w-10" />
                Watch on Plex
              </a>
            </div>
          )}
        </div>
      )}

      {!night.isCancelled && (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-lg text-white">Nominations ({nominations.length})</h2>
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
              {(voting.sortedNominations as MovieNightNomination[]).map((nomination, _index) => {
                const topVoteCount = Math.max(...voting.sortedNominations.map((n) => n.voteCount));
                const isLeader =
                  topVoteCount > 0 &&
                  nomination.voteCount === topVoteCount &&
                  !night.winningMovieId;
                return (
                  <div
                    key={nomination.id}
                    className={clsx(
                      'p-4 md:p-6',
                      nomination.id === night.winningMovieId && 'bg-yellow-600/10',
                      isLeader && 'bg-indigo-600/10'
                    )}
                  >
                    <div className="flex gap-4 md:gap-6">
                      <div className="flex-shrink-0 w-28 sm:w-32 md:w-40">
                        <div className="relative">
                          {nomination.posterUrl ? (
                            <img
                              src={nomination.posterUrl}
                              alt={nomination.title}
                              className="w-full aspect-[2/3] object-cover rounded-xl shadow-lg"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="w-full aspect-[2/3] bg-gray-700 rounded-xl flex items-center justify-center">
                              <Film className="h-12 w-12 text-gray-500" />
                            </div>
                          )}
                          <div
                            className={clsx(
                              'absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[10px] inline-flex items-center gap-1',
                              nomination.mediaType === 'plex'
                                ? 'bg-black/60 text-orange-400'
                                : 'bg-black/60 text-blue-400'
                            )}
                            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
                          >
                            <span
                              className={clsx(
                                'w-1.5 h-1.5 rounded-full',
                                nomination.mediaType === 'plex' ? 'bg-orange-400' : 'bg-blue-400'
                              )}
                            />
                            {nomination.mediaType === 'plex' ? 'Plex' : 'TMDB'}
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            {nomination.ratingKey &&
                            voting.plexServerId &&
                            !user.isLocal &&
                            !user.isLocalInvite ? (
                              <Tooltip content="Open in Plex">
                                <a
                                  href={`https://app.plex.tv/desktop/#!/server/${voting.plexServerId}/details?key=%2Flibrary%2Fmetadata%2F${nomination.ratingKey}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 text-white hover:text-orange-500 transition-colors"
                                >
                                  <Play className="h-4 w-4" />
                                  <h3 className="text-lg">{nomination.title}</h3>
                                </a>
                              </Tooltip>
                            ) : (
                              <h3 className="text-lg text-white">{nomination.title}</h3>
                            )}
                            <p className="text-sm text-gray-400">
                              {nomination.year}
                              {nomination.runtime && ` • ${nomination.runtime} min`}
                              {nomination.voteAverage && (
                                <span className="ml-2 text-yellow-400">
                                  TMDB {nomination.voteAverage.toFixed(1)}
                                </span>
                              )}
                            </p>
                          </div>
                          {nomination.id === night.winningMovieId && (
                            <Trophy className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                          )}
                          {isLeader && (
                            <span className="px-2 py-0.5 text-xs bg-indigo-600 text-white rounded">
                              Leading
                            </span>
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
                            {nomination.watchedBy.map((w) => (
                              <div
                                key={w.userId}
                                className="flex items-center gap-1 px-2 py-0.5 bg-gray-700/50 rounded-full text-xs"
                              >
                                {w.avatarUrl ? (
                                  <img
                                    src={w.avatarUrl}
                                    alt={w.username}
                                    className="h-4 w-4 rounded-full"
                                  />
                                ) : (
                                  <div className="h-4 w-4 rounded-full bg-gray-600 flex items-center justify-center text-[10px]">
                                    {w.username[0].toUpperCase()}
                                  </div>
                                )}
                                <span className="text-gray-300">{w.username}</span>
                              </div>
                            ))}
                            {nomination.watchedBy.some((w) => w.userId === user.id) &&
                              canVote &&
                              (nomination.userHasBlocked ? (
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
                              ))}
                          </div>
                        )}

                        {nomination.isBlocked && nomination.blockedBy && (
                          <div className="mt-2 px-3 py-1.5 bg-red-900/30 border border-red-800/50 rounded-lg">
                            <p className="text-xs text-red-400">
                              Watched and blocked by{' '}
                              {nomination.blockedBy.map((b) => b.username).join(', ')}
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
                                  'w-11 h-11 flex items-center justify-center rounded-lg transition-colors text-xl active:scale-95',
                                  nomination.userVoteCount > 0
                                    ? 'bg-red-600/30 text-red-400 hover:bg-red-600/50'
                                    : 'text-gray-600 cursor-not-allowed'
                                )}
                              >
                                −
                              </button>
                              <span
                                className={clsx(
                                  'w-10 text-center text-base',
                                  nomination.userVoteCount > 0 ? 'text-indigo-400' : 'text-gray-500'
                                )}
                              >
                                {nomination.userVoteCount || 0}
                              </span>
                              <button
                                onClick={() => handleVote(nomination.id)}
                                disabled={voting.userRemainingVotes === 0}
                                className={clsx(
                                  'w-11 h-11 flex items-center justify-center rounded-lg transition-colors text-xl active:scale-95',
                                  voting.userRemainingVotes > 0
                                    ? 'bg-indigo-600/30 text-indigo-400 hover:bg-indigo-600/50'
                                    : 'text-gray-600 cursor-not-allowed'
                                )}
                              >
                                +
                              </button>
                            </div>
                          )}

                          {night.canManage && canNominate && !nomination.isBlocked && (
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

                        {canNominate &&
                          (nomination.nominatedBy.id === user.id ||
                            night.canManage ||
                            user.isAppAdmin) && (
                            <div className="flex justify-end mt-3">
                              <button
                                onClick={() => handleUnnominate(nomination.id)}
                                className="px-2 py-0.5 text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded transition-colors"
                              >
                                Remove
                              </button>
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
                <div
                  className={clsx(
                    'w-12 h-12 rounded-full flex items-center justify-center text-xl',
                    voting.userRemainingVotes > 0
                      ? 'bg-indigo-600/20 text-indigo-400'
                      : 'bg-gray-700 text-gray-500'
                  )}
                >
                  {voting.userRemainingVotes}
                </div>
                <div>
                  <p className="text-white">Votes remaining</p>
                  <p className="text-sm text-gray-400">
                    You have {voting.userRemainingVotes} of {voting.maxVotesPerUser} votes left to
                    distribute
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: voting.maxVotesPerUser }, (_, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'w-3 h-3 rounded-full',
                      i < voting.maxVotesPerUser - voting.userRemainingVotes
                        ? 'bg-indigo-500'
                        : 'bg-gray-600'
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {night.canManage && !night.isCancelled && !isArchived && (
        <div className="mt-6 p-4 bg-gray-800/50 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">Movie Night Status</p>
            <p className="text-white">This movie night is active</p>
          </div>
          <button
            onClick={() =>
              setConfirmModal({
                title: 'Cancel Movie Night',
                message:
                  'Are you sure you want to cancel this movie night? Voting will be disabled.',
                confirmText: 'Cancel Movie Night',
                destructive: true,
                inputLabel: 'Reason (optional)',
                inputPlaceholder: 'e.g. Not enough people available',
                onConfirm: async (reason) => {
                  await handleCancel(reason);
                  setConfirmModal(null);
                },
              })
            }
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
          >
            <XCircle className="h-4 w-4" />
            Cancel
          </button>
        </div>
      )}

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
          inviteId={inviteId}
          onClose={() => setShowInvite(false)}
          onRefresh={handleRefreshInvite}
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
          inputLabel={confirmModal.inputLabel}
          inputPlaceholder={confirmModal.inputPlaceholder}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}
