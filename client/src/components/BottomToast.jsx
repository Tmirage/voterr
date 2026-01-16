import { Check, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { api } from '../lib/api';

export default function BottomToast() {
  const { bottomToast, rankingCountdown, executeRankingNow, clearRankingCountdown, notifications, removeNotification } = useNotifications();

  const hasContent = bottomToast || rankingCountdown || notifications.length > 0;
  if (!hasContent) return null;

  async function handleRetry(service, notificationId) {
    try {
      await api.post(`/settings/retry/${service}`);
      removeNotification(notificationId);
    } catch (error) {
      console.error('Retry failed:', error);
    }
  }

  return (
    <div className="fixed bottom-6 inset-x-0 z-50 flex flex-col gap-3 items-center pointer-events-none">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="px-6 py-3 bg-amber-600 text-white rounded-xl shadow-lg flex items-center gap-2 pointer-events-auto"
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{notification.message}</span>
          {notification.circuitOpen && notification.service && (
            <button
              onClick={() => handleRetry(notification.service, notification.id)}
              className="ml-2 px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-xs flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          )}
          <button
            onClick={() => removeNotification(notification.id)}
            className="ml-1 p-1 hover:bg-white/20 rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {bottomToast?.type === 'votes_cast' && (
        <div className="px-6 py-3 bg-indigo-600 text-white rounded-xl shadow-lg flex items-center gap-2 whitespace-nowrap pointer-events-auto">
          <Check className="h-5 w-5" />
          All your votes are cast!
        </div>
      )}

      {rankingCountdown && (
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={executeRankingNow}
            className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl shadow-lg flex items-center gap-2 transition-colors active:scale-95"
          >
            Update Position in {rankingCountdown.seconds}
          </button>
          <button
            onClick={clearRankingCountdown}
            className="p-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl shadow-lg transition-colors active:scale-95"
            title="Cancel rerank"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
