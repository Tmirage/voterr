import {
  useRef,
  useLayoutEffect,
  Children,
  cloneElement,
  type ReactNode,
  type ElementType,
} from 'react';

interface AnimatedListProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}

export default function AnimatedList({
  children,
  className = '',
  as: Component = 'div',
}: AnimatedListProps) {
  const containerRef = useRef<HTMLElement>(null);
  const positionsRef = useRef(new Map<string, { top: number; left: number }>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = Array.from(container.children) as HTMLElement[];
    const newPositions = new Map<string, { top: number; left: number }>();

    items.forEach((item) => {
      const key = item.dataset.key;
      if (!key) return;

      // Use offsetTop/offsetLeft relative to parent instead of viewport-relative getBoundingClientRect
      const top = item.offsetTop;
      const left = item.offsetLeft;
      const oldPos = positionsRef.current.get(key);
      newPositions.set(key, { top, left });

      if (oldPos) {
        const deltaY = oldPos.top - top;
        const deltaX = oldPos.left - left;

        if (Math.abs(deltaY) > 1 || Math.abs(deltaX) > 1) {
          item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
          item.style.transition = 'none';
          item.style.zIndex = '10';

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              item.style.transform = '';
              item.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
              setTimeout(() => {
                item.style.zIndex = '';
              }, 400);
            });
          });
        }
      }
    });

    positionsRef.current = newPositions;
  });

  return (
    <Component ref={containerRef as React.RefObject<HTMLDivElement>} className={className}>
      {Children.map(children, (child) => {
        if (!child || typeof child !== 'object' || !('key' in child)) return child;
        const element = child as React.ReactElement<{ 'data-key'?: string }>;
        return cloneElement(element, { 'data-key': String(element.key) });
      })}
    </Component>
  );
}
