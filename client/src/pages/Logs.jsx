import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { FileText, AlertTriangle, Info, Bug, AlertCircle, Trash2, Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import LoadingSpinner from '../components/LoadingSpinner';

const LEVEL_CONFIG = {
  error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  warn: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  debug: { icon: Bug, color: 'text-gray-400', bg: 'bg-gray-500/10' }
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [filter, setFilter] = useState({ level: '', category: '' });
  const [expandedLog, setExpandedLog] = useState(null);

  useEffect(() => {
    loadLogs();
    loadStats();
  }, [filter.level, filter.category]);

  async function loadLogs() {
    try {
      const params = new URLSearchParams();
      if (filter.level) params.append('level', filter.level);
      if (filter.category) params.append('category', filter.category);
      params.append('limit', '200');
      
      const data = await api.get(`/logs?${params}`);
      setLogs(data);
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const data = await api.get('/logs/stats');
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadLogs(), loadStats()]);
    setRefreshing(false);
  }

  async function handleClear() {
    if (!confirm('Clear all logs? This cannot be undone.')) return;
    setClearing(true);
    try {
      await api.delete('/logs/clear');
      setLogs([]);
      await loadStats();
    } catch (error) {
      console.error('Failed to clear logs:', error);
    } finally {
      setClearing(false);
    }
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp + 'Z');
    return date.toLocaleString();
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  const categories = stats?.byCategory?.map(c => c.category) || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-white mb-1">System Logs</h1>
          <p className="text-gray-400 text-sm">
            {stats?.total || 0} total entries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className={clsx("h-5 w-5", refreshing && "animate-spin")} />
          </button>
          <button
            onClick={handleClear}
            disabled={clearing || logs.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
          >
            {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Clear
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {['error', 'warn', 'info', 'debug'].map(level => {
            const count = stats.byLevel?.find(l => l.level === level)?.count || 0;
            const config = LEVEL_CONFIG[level];
            const Icon = config.icon;
            return (
              <button
                key={level}
                onClick={() => setFilter(f => ({ ...f, level: f.level === level ? '' : level }))}
                className={clsx(
                  "p-3 rounded-lg transition-all",
                  filter.level === level ? config.bg + " ring-1 ring-current " + config.color : "bg-gray-800 hover:bg-gray-700"
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className={clsx("h-4 w-4", config.color)} />
                  <span className={clsx("text-sm capitalize", filter.level === level ? config.color : "text-gray-300")}>
                    {level}
                  </span>
                </div>
                <p className={clsx("text-xl mt-1", filter.level === level ? config.color : "text-white")}>{count}</p>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <select
          value={filter.category}
          onChange={(e) => setFilter(f => ({ ...f, category: e.target.value }))}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
        >
          <option value="">All categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        {(filter.level || filter.category) && (
          <button
            onClick={() => setFilter({ level: '', category: '' })}
            className="text-sm text-gray-400 hover:text-white"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No logs found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {logs.map(log => {
              const config = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
              const Icon = config.icon;
              const isExpanded = expandedLog === log.id;
              
              return (
                <div
                  key={log.id}
                  className={clsx("transition-colors", isExpanded && "bg-gray-700/30")}
                >
                  <button
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                    className="w-full p-4 text-left hover:bg-gray-700/20 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={clsx("h-4 w-4 mt-0.5 flex-shrink-0", config.color)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={clsx("text-xs px-1.5 py-0.5 rounded", config.bg, config.color)}>
                            {log.category}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTime(log.createdAt)}
                          </span>
                          {log.username && (
                            <span className="text-xs text-gray-400">
                              by {log.username}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-200 truncate">{log.message}</p>
                      </div>
                      <ChevronDown className={clsx(
                        "h-4 w-4 text-gray-500 transition-transform flex-shrink-0",
                        isExpanded && "rotate-180"
                      )} />
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="px-4 pb-4 pl-11 space-y-2">
                      {log.ip && (
                        <p className="text-xs text-gray-400">
                          IP: <span className="text-gray-300 font-mono">{log.ip}</span>
                        </p>
                      )}
                      {log.details && (
                        <pre className="text-xs bg-gray-900 rounded p-3 overflow-x-auto text-gray-300">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
