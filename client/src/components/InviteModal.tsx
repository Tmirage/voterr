import { useState, useEffect } from 'react';
import { Check, Copy, RefreshCw, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  inviteUrl: string;
  inviteId?: number | null;
  onClose: () => void;
  onRefresh?: (id: number) => Promise<void>;
}

export default function InviteModal({ inviteUrl, inviteId, onClose, onRefresh }: Props) {
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, []);

  function copyInviteUrl() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRefresh() {
    if (!onRefresh || !inviteId) return;
    setRefreshing(true);
    try {
      await onRefresh(inviteId);
      setShowConfirm(false);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl text-white mb-2">Invite Link</h2>
        <p className="text-sm text-gray-400 mb-4">
          Share this link with friends to let them vote on movie night. They can login with Plex or
          select their name from the local users list.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={inviteUrl}
            readOnly
            className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
          />
          <button
            onClick={copyInviteUrl}
            className={clsx(
              'px-4 py-2 rounded-lg transition-colors flex items-center gap-2',
              copied ? 'bg-green-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            )}
          >
            {copied ? (
              <>
                <Check className="h-5 w-5" />
                Copied!
              </>
            ) : (
              <Copy className="h-5 w-5" />
            )}
          </button>
        </div>
        {onRefresh && inviteId && !showConfirm && (
          <button
            onClick={() => setShowConfirm(true)}
            className="mt-3 w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-400 transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Regenerate link
          </button>
        )}
        {showConfirm && (
          <div className="mt-3 p-3 bg-amber-900/20 border border-amber-700/50 rounded-lg">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-200">
                This will invalidate the current link. Anyone with the old link will no longer be
                able to join.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={refreshing}
                className="flex-1 px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex-1 px-3 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {refreshing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </div>
        )}
        <button
          onClick={onClose}
          className="mt-2 w-full px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
