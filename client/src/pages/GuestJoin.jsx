import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Film, Calendar, Clock, Users, Trophy, XCircle, Lock } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { format, parseISO } from 'date-fns';

export default function GuestJoin() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { setUser, loginWithPlex, checkPlexAuth } = useAuth();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [joining, setJoining] = useState(false);
  const [plexLoading, setPlexLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [plexPopup, setPlexPopup] = useState(null);
  const [requiresPin, setRequiresPin] = useState(false);
  const [pinGroupInfo, setPinGroupInfo] = useState(null);
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [pinError, setPinError] = useState(null);
  const [pinLoading, setPinLoading] = useState(false);
  const pinRefs = useRef([]);

  useEffect(() => {
    validateInvite();
  }, [token]);

  async function validateInvite(pinCode = null) {
    try {
      setLoading(true);
      const url = pinCode 
        ? `/invites/validate/${token}?pin=${pinCode}`
        : `/invites/validate/${token}`;
      const data = await api.get(url);
      
      if (data.requiresPin) {
        setRequiresPin(true);
        setPinGroupInfo(data);
        setLoading(false);
        return;
      }
      
      setRequiresPin(false);
      setInvite(data);
    } catch (err) {
      if (err.message === 'Invalid PIN') {
        setPinError('Invalid PIN. Please try again.');
        setPin(['', '', '', '', '', '']);
        pinRefs.current[0]?.focus();
      } else if (err.message.includes('Too many requests')) {
        setPinError('Too many attempts. Please wait a minute and try again.');
        setPin(['', '', '', '', '', '']);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
      setPinLoading(false);
    }
  }

  function handlePinChange(index, value) {
    if (!/^\d*$/.test(value)) return;
    
    const newPin = [...pin];
    newPin[index] = value.slice(-1);
    setPin(newPin);
    setPinError(null);

    if (value && index < 5) {
      pinRefs.current[index + 1]?.focus();
    }

    if (newPin.every(d => d !== '') && newPin.join('').length === 6) {
      setPinLoading(true);
      validateInvite(newPin.join(''));
    }
  }

  function handlePinKeyDown(index, e) {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
    }
  }

  function handlePinPaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newPin = pasted.split('');
      setPin(newPin);
      setPinLoading(true);
      validateInvite(pasted);
    }
  }

  async function handlePlexLogin() {
    setPlexLoading(true);
    try {
      const { authUrl } = await loginWithPlex();
      const popup = window.open(authUrl, '_blank', 'width=600,height=700');
      setPlexPopup(popup);
      setPolling(true);
    } catch (err) {
      console.error('Failed to start Plex login:', err);
      setPlexLoading(false);
    }
  }

  useEffect(() => {
    if (!polling || !invite) return;

    const interval = setInterval(async () => {
      try {
        const result = await checkPlexAuth();
        if (result.authenticated) {
          setPolling(false);
          setPlexLoading(false);
          if (plexPopup && !plexPopup.closed) {
            plexPopup.close();
          }
          setPlexPopup(null);
          
          // Join the group via invite after Plex login
          await api.post('/invites/plex-join', { token });
          navigate(`/movie-night/${invite.movieNightId}`);
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [polling, checkPlexAuth, navigate, plexPopup, invite, token]);

  async function handleLocalJoin() {
    if (!selectedUserId) return;
    setJoining(true);

    try {
      const result = await api.post('/invites/local-join', {
        token,
        userId: selectedUserId
      });
      setUser(result.user);
      navigate(`/movie-night/${result.movieNightId}`);
    } catch (err) {
      setError(err.message);
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (requiresPin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Film className="h-10 w-10 text-indigo-500" />
              <h1 className="text-2xl text-white">Voterr</h1>
            </div>
            
            {pinGroupInfo?.groupImageUrl ? (
              <img 
                src={pinGroupInfo.groupImageUrl} 
                alt={pinGroupInfo.groupName}
                className="w-20 h-20 rounded-xl object-cover mx-auto mb-4"
              />
            ) : (
              <div className="w-20 h-20 bg-indigo-600/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Lock className="h-8 w-8 text-indigo-500" />
              </div>
            )}
            
            <h2 className="text-lg text-white mb-2">{pinGroupInfo?.groupName}</h2>
            <p className="text-gray-400 text-sm">Enter the 6-digit PIN to continue</p>
          </div>

          <div className="flex justify-center gap-2 mb-6" onPaste={handlePinPaste}>
            {pin.map((digit, index) => (
              <input
                key={index}
                ref={el => pinRefs.current[index] = el}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handlePinChange(index, e.target.value)}
                onKeyDown={e => handlePinKeyDown(index, e)}
                disabled={pinLoading}
                className={`w-12 h-14 text-center text-2xl bg-gray-700 border-2 rounded-lg text-white focus:outline-none focus:border-indigo-500 transition-colors ${
                  pinError ? 'border-red-500' : 'border-gray-600'
                } ${pinLoading ? 'opacity-50' : ''}`}
                autoFocus={index === 0}
              />
            ))}
          </div>

          {pinError && (
            <p className="text-red-400 text-sm text-center mb-4">{pinError}</p>
          )}

          {!pinError && !pinLoading && pin.some(d => d !== '') && pin.some(d => d === '') && (
            <p className="text-gray-500 text-sm text-center mb-4">
              {6 - pin.filter(d => d !== '').length} more digits needed
            </p>
          )}

          {pinLoading && (
            <div className="flex items-center justify-center gap-2 text-gray-400">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent" />
              <span className="text-sm">Verifying...</span>
            </div>
          )}

          <p className="text-gray-500 text-xs text-center mt-6">
            Ask the group admin for the PIN code
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessages = {
      'Invalid invite link': 'This invite link is no longer valid. It may have been regenerated or deleted.',
      'Invite link has expired': 'This invite link has expired. Please ask for a new link.',
      'This movie night has already passed': 'This movie night has already taken place.',
      'Voting is closed for this movie night': 'Voting has ended for this movie night.',
      'Sharing is disabled for this group': 'Sharing has been disabled for this group.',
    };
    
    const friendlyMessage = errorMessages[error] || 'This invite link is not valid. Please check the link or ask for a new one.';
    
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center">
          <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-red-600/20 flex items-center justify-center">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl text-white mb-2">Link Not Valid</h1>
          <p className="text-gray-400">{friendlyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Film className="h-10 w-10 text-indigo-500" />
            <h1 className="text-2xl text-white">Voterr</h1>
          </div>
          <p className="text-gray-400">You're invited to vote!</p>
        </div>

        <div className="bg-gray-700 rounded-xl p-4 mb-6">
          <div className="flex flex-col items-center text-center mb-3">
            {invite.groupImageUrl ? (
              <img 
                src={invite.groupImageUrl} 
                alt={invite.groupName}
                className="w-16 h-16 rounded-xl object-cover mb-2"
              />
            ) : (
              <div className="w-16 h-16 bg-indigo-600/20 rounded-xl flex items-center justify-center mb-2">
                <Users className="h-7 w-7 text-indigo-500" />
              </div>
            )}
            <h2 className="text-lg text-white">{invite.groupName}</h2>
            {invite.groupDescription && (
              <p className="text-sm text-gray-400 mt-1">{invite.groupDescription}</p>
            )}
          </div>
          <div className="space-y-2 text-sm text-gray-300">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              {format(parseISO(invite.date), 'EEEE, MMMM d, yyyy')}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              {invite.time}
            </div>
          </div>
        </div>

        {invite.isCancelled ? (
          <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-6 mb-6 text-center">
            <XCircle className="h-12 w-12 mx-auto mb-3 text-red-500" />
            <h2 className="text-lg text-red-400 mb-1">Movie Night Cancelled</h2>
            <p className="text-gray-400 text-sm">This movie night has been cancelled.</p>
            {invite.cancelReason && (
              <p className="mt-2 text-gray-500 italic">"{invite.cancelReason}"</p>
            )}
          </div>
        ) : invite.topNominations && invite.topNominations.length > 0 && (
          <div className="bg-gray-700 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-gray-300">Current standings</span>
            </div>
            <div className="space-y-2">
              {invite.topNominations.map((nom, index) => (
                <div key={nom.id} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-4">{index + 1}.</span>
                  {nom.posterUrl ? (
                    <img src={nom.posterUrl} alt={nom.title} className="w-8 h-12 object-cover rounded" />
                  ) : (
                    <div className="w-8 h-12 bg-gray-600 rounded flex items-center justify-center">
                      <Film className="h-4 w-4 text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{nom.title}</p>
                    <p className="text-xs text-gray-400">{nom.voteCount} votes</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handlePlexLogin}
            disabled={plexLoading || joining}
            className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {plexLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                {polling ? 'Waiting for Plex...' : 'Connecting...'}
              </>
            ) : (
              <>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.643 0H4.68l7.679 12L4.68 24h6.963l7.677-12z"/>
                </svg>
                Login with Plex
              </>
            )}
          </button>

          {invite.localUsers && invite.localUsers.length > 0 && (
            <>
              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-gray-600"></div>
                <span className="flex-shrink mx-4 text-gray-500 text-sm">or select your name</span>
                <div className="flex-grow border-t border-gray-600"></div>
              </div>

              <div className="space-y-2">
                {invite.localUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    disabled={plexLoading || joining}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                      selectedUserId === user.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.username} className="h-8 w-8 rounded-full" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-gray-600 flex items-center justify-center text-sm">
                        {user.username[0].toUpperCase()}
                      </div>
                    )}
                    <span className="flex-1 text-left">{user.username}</span>
                    <div className={`text-xs px-2.5 py-1 rounded-full ${
                      user.votesRemaining === 0 
                        ? 'bg-red-500/20 text-red-400' 
                        : 'bg-indigo-500/20 text-indigo-300'
                    }`}>
                      {user.votesRemaining} of {invite.maxVotesPerUser} votes left
                    </div>
                  </button>
                ))}
              </div>

              {selectedUserId && (
                <button
                  onClick={handleLocalJoin}
                  disabled={joining || plexLoading}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
                >
                  {joining ? 'Joining...' : 'Vote'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
