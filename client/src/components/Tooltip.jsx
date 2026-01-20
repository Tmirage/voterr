import { Tooltip as ReactTooltip } from 'react-tooltip';
import { useId } from 'react';

export default function Tooltip({ children, content, position = 'top' }) {
  const id = useId();

  if (!content) return children;

  const isStringContent = typeof content === 'string';

  return (
    <>
      <span 
        data-tooltip-id={id} 
        {...(isStringContent ? { 'data-tooltip-content': content } : {})}
        className="inline-flex"
      >
        {children}
      </span>
      <ReactTooltip
        id={id}
        place={position}
        className="!bg-gray-900 !text-white !text-xs !px-2.5 !py-1.5 !rounded-lg !border !border-gray-700 !opacity-100 z-[9999]"
        delayShow={200}
        render={isStringContent ? undefined : () => content}
      />
    </>
  );
}
