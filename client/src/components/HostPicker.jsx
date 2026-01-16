import { useEffect } from 'react';
import clsx from 'clsx';
import { Crown } from 'lucide-react';

export default function HostPicker({ members, currentHostId, onSelect, onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl text-white mb-4">Change Host</h2>
        <p className="text-sm text-gray-400 mb-4">
          Select a group member to be the host
        </p>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          <button
            onClick={() => onSelect(null)}
            className={clsx(
              "w-full flex items-center gap-3 p-3 rounded-lg transition-colors",
              !currentHostId
                ? "bg-gray-600/20 border border-gray-500"
                : "bg-gray-700 hover:bg-gray-600"
            )}
          >
            <div className="h-8 w-8 rounded-full bg-gray-600 flex items-center justify-center text-gray-400">
              —
            </div>
            <span className="text-gray-400">No host</span>
          </button>
          {members?.map((m) => (
            <button
              key={m.userId}
              onClick={() => onSelect(m.userId)}
              className={clsx(
                "w-full flex items-center gap-3 p-3 rounded-lg transition-colors",
                m.userId === currentHostId
                  ? "bg-purple-600/20 border border-purple-600"
                  : "bg-gray-700 hover:bg-gray-600"
              )}
            >
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt={m.username} className="h-8 w-8 rounded-full" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-gray-600 flex items-center justify-center">
                  {m.username?.[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-white">{m.username}</span>
              {m.userId === currentHostId && (
                <Crown className="h-4 w-4 text-purple-400 ml-auto" />
              )}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
