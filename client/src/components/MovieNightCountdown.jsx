import { useState, useEffect } from 'react';
import { differenceInDays, differenceInHours, differenceInMinutes, parseISO, format } from 'date-fns';
import { Crown, Calendar } from 'lucide-react';

function getCountdown(date, time) {
  const eventDate = parseISO(`${date}T${time}`);
  const now = new Date();
  
  if (eventDate <= now) {
    return { passed: true, text: 'now' };
  }
  
  const days = differenceInDays(eventDate, now);
  const hours = differenceInHours(eventDate, now) % 24;
  const minutes = differenceInMinutes(eventDate, now) % 60;
  
  if (days > 0) {
    return { passed: false, text: `in ${days}d ${hours}h ${minutes}m` };
  } else if (hours > 0) {
    return { passed: false, text: `in ${hours}h ${minutes}m` };
  } else {
    return { passed: false, text: `in ${minutes}m` };
  }
}

export default function MovieNightCountdown({ title, date, time, hostName, onHostClick, canChangeHost, groupName, groupDescription }) {
  const [countdown, setCountdown] = useState(() => getCountdown(date, time));
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getCountdown(date, time));
    }, 60000);
    return () => clearInterval(interval);
  }, [date, time]);

  const eventDate = parseISO(date);
  const formattedDate = format(eventDate, 'EEE d MMM');

  return (
    <div>
      <h1 className="text-2xl text-white flex items-baseline gap-3">
        <span>{title}</span>
        {!countdown.passed && (
          <span className="text-lg font-light text-gray-400">{countdown.text}</span>
        )}
      </h1>
      
      {groupName && (
        <p className="text-gray-400 mt-1">{groupName}</p>
      )}
      
      {groupDescription && (
        <p className="text-sm text-gray-500 mt-1">{groupDescription}</p>
      )}
      
      <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
        {hostName ? (
          canChangeHost ? (
            <button
              onClick={onHostClick}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 hover:text-indigo-300 transition-colors"
            >
              <Crown className="h-3.5 w-3.5" />
              {hostName}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-400">
              <Crown className="h-3.5 w-3.5" />
              {hostName}
            </span>
          )
        ) : canChangeHost && (
          <button
            onClick={onHostClick}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 hover:text-indigo-300 transition-colors"
          >
            <Crown className="h-3.5 w-3.5" />
            Set host
          </button>
        )}
        
        <span className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {formattedDate} · {time}
        </span>
      </div>
    </div>
  );
}
