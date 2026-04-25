import { useCallback } from 'react';
import RemoteCursors from './RemoteCursors';
import type { RemoteCursor } from '../hooks/useCollab';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onCursorMove: (position: number) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  remoteCursors: RemoteCursor[];
}

export default function Editor({ value, onChange, onCursorMove, textareaRef, remoteCursors }: Props) {
  const lines = value.split('\n');

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
    onChange(el.value);
    onCursorMove(el.selectionStart);
  }, [onChange, onCursorMove]);

  const handleSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    onCursorMove(e.currentTarget.selectionStart);
  }, [onCursorMove]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const textBeforeCursor = textarea.value.slice(0, start);
    const currentLineStart = textBeforeCursor.lastIndexOf('\n') + 1;
    const currentLine = textBeforeCursor.slice(currentLineStart);
    const stripped = currentLine.trimEnd();
    const ulMatch = stripped.match(/^(\s*)([-*+])\s/);
    const olMatch = stripped.match(/^(\s*)(\d+)\.\s/);
    let prefix = '';
    if (ulMatch) {
      if (stripped === ulMatch[1] + ulMatch[2] + ' ') {
        const before = textarea.value.slice(0, currentLineStart);
        const after = textarea.value.slice(start);
        e.preventDefault();
        onChange(before + '\n' + after);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = before.length + 1;
        });
        return;
      }
      prefix = ulMatch[1] + ulMatch[2] + ' ';
    } else if (olMatch) {
      const num = parseInt(olMatch[2], 10);
      if (stripped === olMatch[1] + num + '. ') {
        const before = textarea.value.slice(0, currentLineStart);
        const after = textarea.value.slice(start);
        e.preventDefault();
        onChange(before + '\n' + after);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = before.length + 1;
        });
        return;
      }
      prefix = olMatch[1] + (num + 1) + '. ';
    }
    if (prefix) {
      e.preventDefault();
      const before = textarea.value.slice(0, start);
      const after = textarea.value.slice(start);
      const newValue = before + '\n' + prefix + after;
      onChange(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = before.length + 1 + prefix.length;
      });
    }
  }, [onChange]);

  const handleRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
    if (textareaRef && 'current' in textareaRef) {
      (textareaRef as React.RefObject<HTMLTextAreaElement | null>).current = el;
    }
  }, [textareaRef]);

  return (
    <div className="flex justify-center flex-1">
      <div className="relative w-full max-w-[780px] bg-paper rounded-md shadow-[0_1px_3px_var(--color-paper-shadow),0_8px_24px_var(--color-paper-shadow)] border border-border-light p-12 pr-16 pl-20 mx-6 mb-12 mt-8">
        <div
          className="absolute left-4 top-12 w-11 text-right font-ui text-[11px] text-ink-muted opacity-50 pointer-events-none select-none"
          aria-hidden="true"
        >
          {lines.map((_line, i) => (
            <div key={i} className="h-[29.75px]">
              {i + 1}
            </div>
          ))}
        </div>
        <div className="relative">
          <textarea
            ref={handleRef}
            value={value}
            onChange={handleChange}
            onSelect={handleSelect}
            onKeyDown={handleKeyDown}
            className="w-full border-none outline-none resize-none font-body text-[17px] leading-[1.75] text-ink bg-transparent caret-accent min-h-[80vh] overflow-hidden"
            placeholder="Start writing..."
            spellCheck
          />
          <RemoteCursors cursors={remoteCursors} text={value} textareaRef={textareaRef} />
        </div>
      </div>
    </div>
  );
}
