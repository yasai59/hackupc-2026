import { useState, useCallback, useRef } from 'react';
import Toolbar from './Toolbar';
import Editor from './Editor';
import MarkdownPreview from './MarkdownPreview';
import CollabBar from './CollabBar';
import { useCollab } from '../hooks/useCollab';

function wrapSelection(text: string, start: number, end: number, before: string, after: string) {
  return text.slice(0, start) + before + text.slice(start, end) + after + text.slice(end);
}

function insertAtLineStart(text: string, start: number, prefix: string) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  return text.slice(0, lineStart) + prefix + text.slice(lineStart);
}

export default function EditorApp() {
  const [content, setContent] = useState('');
  const [username, setUsername] = useState('Writer');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRemoteChange = useCallback((text: string) => {
    setContent(text);
  }, []);

  const [collabState, collabActions] = useCollab(content, handleRemoteChange, username);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  const handleCursorMove = useCallback((position: number) => {
    if (cursorTimerRef.current) return;
    cursorTimerRef.current = setTimeout(() => {
      cursorTimerRef.current = null;
      collabActions.broadcastCursor(position);
    }, 50);
  }, [collabActions]);

  const handleContentChange = useCallback((text: string) => {
    setContent(text);
    collabActions.broadcastChange(text);
  }, [collabActions]);

  const handleFormat = useCallback((type: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.slice(start, end);
    let newText = content;
    let cursorPos = end;

    switch (type) {
      case 'h1':
        newText = insertAtLineStart(content, start, '# ');
        cursorPos = start + 2;
        break;
      case 'h2':
        newText = insertAtLineStart(content, start, '## ');
        cursorPos = start + 3;
        break;
      case 'h3':
        newText = insertAtLineStart(content, start, '### ');
        cursorPos = start + 4;
        break;
      case 'bold':
        newText = wrapSelection(content, start, end, '**', '**');
        cursorPos = selectedText ? end + 4 : start + 2;
        break;
      case 'italic':
        newText = wrapSelection(content, start, end, '*', '*');
        cursorPos = selectedText ? end + 2 : start + 1;
        break;
      case 'strikethrough':
        newText = wrapSelection(content, start, end, '~~', '~~');
        cursorPos = selectedText ? end + 4 : start + 2;
        break;
      case 'quote':
        newText = insertAtLineStart(content, start, '> ');
        cursorPos = start + 2;
        break;
      case 'code':
        newText = wrapSelection(content, start, end, '`', '`');
        cursorPos = selectedText ? end + 2 : start + 1;
        break;
      case 'codeblock':
        newText = wrapSelection(content, start, end, '```\n', '\n```');
        cursorPos = start + 4;
        break;
      case 'hr':
        newText = content.slice(0, end) + '\n---\n' + content.slice(end);
        cursorPos = end + 5;
        break;
      case 'ul':
        newText = insertAtLineStart(content, start, '- ');
        cursorPos = start + 2;
        break;
      case 'ol':
        newText = insertAtLineStart(content, start, '1. ');
        cursorPos = start + 3;
        break;
      case 'link':
        newText = wrapSelection(content, start, end, '[', '](url)');
        cursorPos = selectedText ? end + 7 : start + 1;
        break;
      default:
        return;
    }

    handleContentChange(newText);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }, [content, handleContentChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') {
        e.preventDefault();
        handleFormat('bold');
      } else if (e.key === 'i') {
        e.preventDefault();
        handleFormat('italic');
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      handleContentChange(content.slice(0, start) + '  ' + content.slice(end));
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  }, [content, handleFormat, handleContentChange]);

  const handleDownload = useCallback(async () => {
    const fileName = (collabState.roomId || 'document') + '.md';
    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__?.invoke;

    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      try {
        await invoke('save_file_dialog', { content, fileName });
      } catch { /* user cancelled */ }
    } else if ('showSaveFilePicker' in window) {
      const blob = new Blob([content], { type: 'text/markdown' });
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'Markdown File',
            accept: { 'text/markdown': ['.md'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } catch { /* user cancelled */ }
    } else {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [content, collabState.roomId]);

  return (
    <div className="flex flex-col min-h-screen" onKeyDown={handleKeyDown}>
      <CollabBar
        state={collabState}
        username={username}
        onUsernameChange={setUsername}
        onCreateRoom={collabActions.createRoom}
        onJoinRoom={collabActions.joinRoom}
        onDisconnect={collabActions.disconnect}
        onDeleteRoom={collabActions.deleteRoom}
        onLoadRoom={(id) => localStorage.getItem('inkwell-doc-' + id)}
        onRehostRoom={collabActions.createRoomFromDoc}
      />
      <Toolbar onFormat={handleFormat} wordCount={wordCount} charCount={charCount} onDownload={handleDownload} />
      <div className="flex flex-row items-start">
        <Editor
          value={content}
          onChange={handleContentChange}
          onCursorMove={handleCursorMove}
          textareaRef={textareaRef}
          remoteCursors={collabActions.remoteCursors}
        />
        <MarkdownPreview markdown={content} />
      </div>
    </div>
  );
}
