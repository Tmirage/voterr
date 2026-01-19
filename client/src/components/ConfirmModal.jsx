import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function ConfirmModal({ 
  title = 'Confirm', 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  onConfirm, 
  onCancel,
  destructive = false,
  inputLabel = null,
  inputPlaceholder = ''
}) {
  const [inputValue, setInputValue] = useState('');
  const scrollYRef = useRef(window.scrollY);

  useEffect(() => {
    scrollYRef.current = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    
    return () => { 
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      window.scrollTo(0, scrollYRef.current);
    };
  }, []);

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
      onClick={onCancel}
    >
      <div 
        className="bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          {destructive && (
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-red-600/20 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-lg text-white">{title}</h2>
            <p className="mt-2 text-sm text-gray-400">{message}</p>
            {inputLabel && (
              <div className="mt-4">
                <label className="block text-sm text-gray-400 mb-1">{inputLabel}</label>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={inputPlaceholder}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={() => onConfirm(inputValue)}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              destructive 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
