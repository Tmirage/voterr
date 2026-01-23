import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

interface Member {
  id: number;
  username: string;
  avatarUrl?: string | null;
  votingComplete?: boolean;
  votesUsed?: number;
  maxVotes?: number;
}

interface Attendance {
  id?: number;
  userId: number;
  status: 'attending' | 'absent' | string | null;
}

type AttendanceStatus = 'attending' | 'absent' | 'pending';

interface Props {
  members: Member[];
  attendance?: Attendance[];
  canManage?: boolean;
  onSetAttendance?: (userId: number, status: AttendanceStatus) => void;
}

export default function MemberStatusList({
  members,
  attendance,
  canManage,
  onSetAttendance,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    if (openDropdown !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openDropdown]);

  if (!members || members.length === 0) return null;

  const counts = members.reduce(
    (acc, member) => {
      const memberAttendance = attendance?.find((a) => a.userId === member.id);
      if (memberAttendance?.status === 'attending') acc.attending++;
      else if (memberAttendance?.status === 'absent') acc.absent++;
      else acc.notSet++;
      return acc;
    },
    { attending: 0, absent: 0, notSet: 0 }
  );

  function handleStatusChange(memberId: number, status: AttendanceStatus) {
    if (onSetAttendance) {
      onSetAttendance(memberId, status);
    }
    setOpenDropdown(null);
  }

  return (
    <div className="bg-gray-700/30 rounded-lg p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-xs text-gray-500 sm:cursor-default"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-green-400">{counts.attending} attending</span>
          <span className="text-red-400">{counts.absent} absent</span>
          <span className="text-gray-400">{counts.notSet} not set</span>
        </div>
        <ChevronDown
          className={clsx(
            'h-4 w-4 text-gray-500 transition-transform sm:hidden',
            expanded && 'rotate-180'
          )}
        />
      </button>
      <div className={clsx('flex-wrap gap-2 mt-2', expanded ? 'flex' : 'hidden sm:flex')}>
        {members.map((member) => {
          const memberAttendance = attendance?.find((a) => a.userId === member.id);
          const isAbsent = memberAttendance?.status === 'absent';
          const isAttending = memberAttendance?.status === 'attending';
          const isClickable = canManage && onSetAttendance;
          const isDropdownOpen = openDropdown === member.id;

          return (
            <div
              key={`member-${member.id}-${member.username}`}
              className="relative"
              ref={isDropdownOpen ? dropdownRef : undefined}
            >
              <button
                type="button"
                onClick={() => isClickable && setOpenDropdown(isDropdownOpen ? null : member.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs',
                  isAbsent
                    ? 'bg-red-900/30'
                    : isAttending
                      ? 'bg-green-900/30'
                      : 'bg-gray-700/50 border border-dashed border-gray-600',
                  isClickable && 'cursor-pointer hover:ring-1 hover:ring-white/30 transition-all'
                )}
              >
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
                ) : (
                  <div className="h-5 w-5 rounded-full bg-gray-600 flex items-center justify-center text-[9px] text-white">
                    {member.username?.[0]?.toUpperCase()}
                  </div>
                )}
                <span
                  className={clsx(
                    'truncate max-w-[60px]',
                    isAbsent ? 'text-red-300' : isAttending ? 'text-green-300' : 'text-gray-400'
                  )}
                >
                  {member.username}
                </span>
                <span
                  className={clsx(
                    'text-[10px] px-1 py-0.5 rounded',
                    isAbsent
                      ? 'bg-red-800/50 text-red-300'
                      : isAttending
                        ? 'bg-green-800/50 text-green-300'
                        : 'bg-gray-600/50 text-gray-400'
                  )}
                >
                  {isAbsent ? 'absent' : isAttending ? 'attending' : 'not set'}
                </span>
                {isAttending && member.votesUsed !== undefined && member.maxVotes !== undefined && (
                  <span
                    className={clsx(
                      'text-[10px] px-1 py-0.5 rounded',
                      member.votingComplete
                        ? 'bg-indigo-800/50 text-indigo-300'
                        : 'bg-gray-600/50 text-gray-400'
                    )}
                  >
                    {member.votesUsed}/{member.maxVotes}
                  </span>
                )}
                {isClickable && <ChevronDown className="h-3 w-3 text-gray-500" />}
              </button>
              {isDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-lg py-1 min-w-[100px]">
                  <button
                    type="button"
                    onClick={() => handleStatusChange(member.id, 'attending')}
                    className={clsx(
                      'w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 transition-colors',
                      isAttending ? 'text-green-400' : 'text-gray-300'
                    )}
                  >
                    Attending
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(member.id, 'absent')}
                    className={clsx(
                      'w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 transition-colors',
                      isAbsent ? 'text-red-400' : 'text-gray-300'
                    )}
                  >
                    Absent
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(member.id, 'pending')}
                    className={clsx(
                      'w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 transition-colors',
                      !isAttending && !isAbsent ? 'text-gray-400' : 'text-gray-300'
                    )}
                  >
                    Not set
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
