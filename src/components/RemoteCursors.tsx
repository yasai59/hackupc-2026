import { useLayoutEffect, useState, useRef } from 'react';
import type { RemoteCursor } from '../hooks/useCollab';

interface Props {
  cursors: RemoteCursor[];
  text: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

function getCursorCoords(position: number, text: string, textarea: HTMLTextAreaElement, container: HTMLElement) {
  const before = text.slice(0, position);

  const mirror = document.createElement('div');
  const cs = getComputedStyle(textarea);

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.wordBreak = 'break-word';
  mirror.style.width = cs.width;
  mirror.style.padding = cs.padding;
  mirror.style.border = cs.border;
  mirror.style.fontFamily = cs.fontFamily;
  mirror.style.fontSize = cs.fontSize;
  mirror.style.lineHeight = cs.lineHeight;
  mirror.style.letterSpacing = cs.letterSpacing;
  mirror.style.tabSize = cs.tabSize;

  const textNode = document.createTextNode(before);
  mirror.appendChild(textNode);

  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);

  container.appendChild(mirror);

  const top = marker.offsetTop;
  const left = marker.offsetLeft;

  container.removeChild(mirror);

  return { top, left };
}

export default function RemoteCursors({ cursors, text, textareaRef }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<Map<string, { top: number; left: number }>>(new Map());

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const wrapper = wrapperRef.current;
    if (!textarea || !wrapper) return;

    const newCoords = new Map<string, { top: number; left: number }>();

    for (const cursor of cursors) {
      const pos = Math.min(cursor.position, text.length);
      const { top, left } = getCursorCoords(pos, text, textarea, wrapper);
      newCoords.set(cursor.peerId, { top, left });
    }

    setCoords(newCoords);
  }, [cursors, text, textareaRef]);

  return (
    <div ref={wrapperRef} className="absolute inset-0 pointer-events-none z-5 overflow-hidden">
      {cursors.map(cursor => {
        const pos = coords.get(cursor.peerId);
        if (!pos) return null;
        return (
          <div
            key={cursor.peerId}
            style={{
              top: pos.top,
              left: pos.left,
              background: cursor.color,
            }}
            className="absolute w-[2px] h-[29.75px] rounded-sm transition-[top,left] duration-[80ms] ease-out opacity-85"
          >
            <div
              style={{ background: cursor.color }}
              className="absolute -top-[18px] -left-[1px] text-[10px] leading-[14px] font-ui font-semibold text-white px-1 py-0.5 rounded-[3px_3px_3px_0] whitespace-nowrap"
            >
              {cursor.name} ({cursor.peerId.slice(-4)})
            </div>
          </div>
        );
      })}
    </div>
  );
}
