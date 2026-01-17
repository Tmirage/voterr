import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, parseISO } from 'date-fns';
import { Calendar } from 'lucide-react';
import 'react-day-picker/dist/style.css';

export default function DatePicker({ value, onChange, minDate, placeholder = 'Select date' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedDate = value ? parseISO(value) : undefined;

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  function handleSelect(date) {
    if (date) {
      const formatted = format(date, 'yyyy-MM-dd');
      onChange(formatted);
    }
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-11 px-4 bg-gray-700 border border-gray-600 rounded-lg text-left flex items-center justify-between focus:outline-none focus:border-indigo-500 transition-colors"
      >
        <span className={selectedDate ? 'text-white' : 'text-gray-400'}>
          {selectedDate ? format(selectedDate, 'EEEE, MMM d, yyyy') : placeholder}
        </span>
        <Calendar className="h-4 w-4 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-3 touch-manipulation">
          <style>{`
            .rdp {
              --rdp-cell-size: 40px;
              --rdp-accent-color: #6366f1;
              --rdp-background-color: rgba(99, 102, 241, 0.2);
              margin: 0;
            }
            .rdp-months {
              justify-content: center;
            }
            .rdp-month {
              background: transparent;
            }
            .rdp-caption {
              padding: 0 0 8px 0;
            }
            .rdp-caption_label {
              color: white;
              font-size: 1rem;
            }
            .rdp-nav_button {
              color: #9ca3af;
              width: 32px;
              height: 32px;
            }
            .rdp-nav_button:hover {
              background: rgba(99, 102, 241, 0.2);
              color: white;
            }
            .rdp-head_cell {
              color: #9ca3af;
              font-size: 0.75rem;
              font-weight: normal;
            }
            .rdp-day {
              color: #d1d5db;
              border-radius: 8px;
            }
            .rdp-day:hover:not(.rdp-day_selected):not(.rdp-day_disabled) {
              background: rgba(99, 102, 241, 0.2);
              color: white;
            }
            .rdp-day_selected {
              background: #6366f1 !important;
              color: white !important;
            }
            .rdp-day_today:not(.rdp-day_selected) {
              color: #6366f1;
              font-weight: normal;
            }
            .rdp-day_disabled {
              color: #4b5563;
            }
            @media (max-width: 640px) {
              .rdp {
                --rdp-cell-size: 44px;
              }
            }
          `}</style>
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            disabled={minDate ? { before: parseISO(minDate) } : undefined}
            showOutsideDays
            fixedWeeks
          />
        </div>
      )}
    </div>
  );
}
