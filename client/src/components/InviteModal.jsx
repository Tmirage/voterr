import { useState, useEffect } from 'react';
import { Check, Copy } from 'lucide-react';
import clsx from 'clsx';

export default function InviteModal({ inviteUrl, onClose }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  function copyInviteUrl() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl text-white mb-2">Invite Link</h2>
        <p className="text-sm text-gray-400 mb-4">
          Share this link with friends to let them vote on movie night. They can login with Plex or select their name from the local users list.
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
              "px-4 py-2 rounded-lg transition-colors flex items-center gap-2",
              copied
                ? "bg-green-600 text-white"
                : "bg-indigo-600 hover:bg-indigo-700 text-white"
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
        <button
          onClick={onClose}
          className="mt-4 w-full px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
