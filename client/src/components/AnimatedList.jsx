import { useRef, useLayoutEffect, Children, cloneElement } from 'react';

export default function AnimatedList({ children, className = '', as: Component = 'div' }) {
  const containerRef = useRef(null);
  const positionsRef = useRef(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = Array.from(container.children);
    const newPositions = new Map();

    items.forEach((item) => {
      const key = item.dataset.key;
      if (!key) return;
      
      const rect = item.getBoundingClientRect();
      const oldPos = positionsRef.current.get(key);
      newPositions.set(key, { top: rect.top, left: rect.left });

      if (oldPos) {
        const deltaY = oldPos.top - rect.top;
        const deltaX = oldPos.left - rect.left;

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
    <Component ref={containerRef} className={className}>
      {Children.map(children, (child) => {
        if (!child?.key) return child;
        return cloneElement(child, {
          'data-key': child.key,
        });
      })}
    </Component>
  );
}
