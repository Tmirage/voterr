import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Film, Check, ChevronRight, Server, Database, Loader2, X } from 'lucide-react';
import clsx from 'clsx';

const STEPS = [
  { id: 'plex', title: 'Plex Account', description: 'Connect your Plex account' },
  { id: 'overseerr', title: 'Overseerr', description: 'Optional: Browse all movies (TMDB)' },
  { id: 'tautulli', title: 'Tautulli', description: 'Optional: Watch history tracking' }
];

export default function Setup() {
  const navigate = useNavigate();
  const { setUser, setSetupComplete } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [plexUser, setPlexUser] = useState(null);
  const [polling, setPolling] = useState(false);
  const [config, setConfig] = useState({
    overseerrUrl: '',
    overseerrApiKey: '',
    tautulliUrl: '',
    tautulliApiKey: ''
  });
  const [error, setError] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [plexPopup, setPlexPopup] = useState(null);
  const [testing, setTesting] = useState({ overseerr: false, tautulli: false });
  const [testResult, setTestResult] = useState({ overseerr: null, tautulli: null });

  async function handlePlexLogin() {
    setError(null);
    try {
      const { authUrl } = await api.post('/setup/plex-auth');
      const popup = window.open(authUrl, '_blank', 'width=600,height=700');
      setPlexPopup(popup);
      setPolling(true);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!polling) return;

    const interval = setInterval(async () => {
      try {
        const result = await api.get('/setup/plex-auth/check');
        if (result.authenticated) {
          setPlexUser(result.user);
          setPolling(false);
          if (plexPopup && !plexPopup.closed) {
            plexPopup.close();
          }
          setPlexPopup(null);
          setCurrentStep(1);
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [polling, plexPopup]);

  async function handleComplete() {
    setError(null);
    setCompleting(true);

    try {
      const result = await api.post('/setup/complete', config);
      setUser(result.user);
      setSetupComplete(true);
      navigate('/');
    } catch (err) {
      setError(err.message);
      setCompleting(false);
    }
  }

  function canProceed() {
    if (currentStep === 0) return !!plexUser;
    return true;
  }

  async function testOverseerr() {
    if (!config.overseerrUrl || !config.overseerrApiKey) return;
    setTesting(t => ({ ...t, overseerr: true }));
    setTestResult(r => ({ ...r, overseerr: null }));
    try {
      const result = await api.post('/settings/test/overseerr', {
        url: config.overseerrUrl,
        apiKey: config.overseerrApiKey
      });
      setTestResult(r => ({ ...r, overseerr: { success: true } }));
    } catch (e) {
      setTestResult(r => ({ ...r, overseerr: { success: false, message: e.message || 'Connection failed' } }));
    } finally {
      setTesting(t => ({ ...t, overseerr: false }));
    }
  }

  async function testTautulli() {
    if (!config.tautulliUrl || !config.tautulliApiKey) return;
    setTesting(t => ({ ...t, tautulli: true }));
    setTestResult(r => ({ ...r, tautulli: null }));
    try {
      const result = await api.post('/settings/test/tautulli', {
        url: config.tautulliUrl,
        apiKey: config.tautulliApiKey
      });
      setTestResult(r => ({ ...r, tautulli: { success: true } }));
    } catch (e) {
      setTestResult(r => ({ ...r, tautulli: { success: false, message: e.message || 'Connection failed' } }));
    } finally {
      setTesting(t => ({ ...t, tautulli: false }));
    }
  }

  function handleNext() {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Film className="h-12 w-12 text-indigo-500" />
            <h1 className="text-4xl text-white">Voterr</h1>
          </div>
          <p className="text-gray-400">Initial Setup</p>
        </div>

        <div className="flex justify-center mb-8">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm transition-colors",
                index < currentStep
                  ? "bg-green-600 text-white"
                  : index === currentStep
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-700 text-gray-400"
              )}>
                {index < currentStep ? (
                  <Check className="h-5 w-5" />
                ) : (
                  index + 1
                )}
              </div>
              {index < STEPS.length - 1 && (
                <div className={clsx(
                  "w-16 h-1 mx-2",
                  index < currentStep ? "bg-green-600" : "bg-gray-700"
                )} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-gray-800 rounded-xl p-8">
          <h2 className="text-xl text-white mb-2">{STEPS[currentStep].title}</h2>
          <p className="text-gray-400 mb-6">{STEPS[currentStep].description}</p>

          {error && (
            <div className="mb-6 p-4 bg-red-600/20 border border-red-600/30 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {currentStep === 0 && (
            <div>
              {plexUser ? (
                <div className="flex items-center gap-4 p-4 bg-gray-700 rounded-lg">
                  {plexUser.thumb ? (
                    <img src={plexUser.thumb} alt={plexUser.username} className="h-12 w-12 rounded-full" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                      {plexUser.username[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-white">{plexUser.username}</p>
                    <p className="text-sm text-gray-400">{plexUser.email}</p>
                  </div>
                  <Check className="ml-auto h-6 w-6 text-green-500" />
                </div>
              ) : (
                <button
                  onClick={handlePlexLogin}
                  disabled={polling}
                  className="w-full flex items-center justify-center gap-3 bg-[#e5a00d] hover:bg-[#cc8f0c] disabled:opacity-50 text-black py-3 px-4 rounded-lg transition-colors"
                >
                  {polling ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-black border-t-transparent" />
                      Waiting for Plex...
                    </>
                  ) : (
                    'Sign in with Plex'
                  )}
                </button>
              )}
              <p className="mt-4 text-sm text-gray-500">
                This account will become the admin of your Voterr instance.
              </p>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400 mb-4">
                Overseerr is optional. It allows users to browse and nominate any movie from TMDB, not just movies in your Plex library.
              </p>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Server className="h-4 w-4 inline mr-2" />
                  Overseerr URL
                </label>
                <input
                  type="text"
                  value={config.overseerrUrl}
                  onChange={(e) => setConfig({ ...config, overseerrUrl: e.target.value })}
                  placeholder="http://localhost:5055"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Database className="h-4 w-4 inline mr-2" />
                  API Key
                </label>
                <input
                  type="text"
                  value={config.overseerrApiKey}
                  onChange={(e) => setConfig({ ...config, overseerrApiKey: e.target.value })}
                  placeholder="Your Overseerr API key"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Find your API key in Overseerr Settings → General
                </p>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={testOverseerr}
                  disabled={testing.overseerr || !config.overseerrUrl || !config.overseerrApiKey}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  {testing.overseerr ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test Connection'}
                </button>
                {testResult.overseerr && (
                  <span className={clsx("flex items-center gap-1 text-sm", testResult.overseerr.success ? "text-green-400" : "text-red-400")}>
                    {testResult.overseerr.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    {testResult.overseerr.success ? 'Connected' : testResult.overseerr.message}
                  </span>
                )}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400 mb-4">
                Tautulli is optional but recommended. It allows Voterr to show which users have already watched a movie.
              </p>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Server className="h-4 w-4 inline mr-2" />
                  Tautulli URL
                </label>
                <input
                  type="text"
                  value={config.tautulliUrl}
                  onChange={(e) => setConfig({ ...config, tautulliUrl: e.target.value })}
                  placeholder="http://localhost:8181"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Database className="h-4 w-4 inline mr-2" />
                  Tautulli API Key
                </label>
                <input
                  type="password"
                  value={config.tautulliApiKey}
                  onChange={(e) => setConfig({ ...config, tautulliApiKey: e.target.value })}
                  placeholder="Your Tautulli API key"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Found in Tautulli → Settings → Web Interface → API Key
                </p>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={testTautulli}
                  disabled={testing.tautulli || !config.tautulliUrl || !config.tautulliApiKey}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  {testing.tautulli ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test Connection'}
                </button>
                {testResult.tautulli && (
                  <span className={clsx("flex items-center gap-1 text-sm", testResult.tautulli.success ? "text-green-400" : "text-red-400")}>
                    {testResult.tautulli.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    {testResult.tautulli.success ? 'Connected' : testResult.tautulli.message}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8">
            {currentStep > 0 ? (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Back
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={handleNext}
              disabled={!canProceed() || completing}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {completing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Completing...
                </>
              ) : currentStep === STEPS.length - 1 ? (
                'Complete Setup'
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
