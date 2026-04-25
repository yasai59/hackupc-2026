import { useState, useCallback, useRef, useEffect } from 'react';

const CURSOR_COLORS = ['#c45d3e', '#2d8a4e', '#4a6fa5', '#9b59b6', '#e67e22', '#1abc9c', '#e74c3c', '#3498db'];
const SIDECAR_URL = 'ws://localhost:9876';

export interface RemoteCursor {
  peerId: string;
  position: number;
  color: string;
  name: string;
}

interface CollabState {
  isConnected: boolean;
  roomId: string | null;
  peerCount: number;
  error: string | null;
  savedRooms: string[];
}

interface CollabActions {
  createRoom: () => void;
  createRoomFromDoc: (roomId: string) => void;
  joinRoom: (id: string) => void;
  disconnect: () => void;
  broadcastChange: (text: string) => void;
  broadcastCursor: (position: number) => void;
  remoteCursors: RemoteCursor[];
  deleteRoom: (id: string) => void;
}

const ROOMS_KEY = 'inkwell-rooms';
const DOC_PREFIX = 'inkwell-doc-';

function getSavedRooms(): string[] {
  try { return JSON.parse(localStorage.getItem(ROOMS_KEY) || '[]'); }
  catch { return []; }
}

function saveRooms(rooms: string[]) { localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms)); }
function saveDoc(roomId: string, text: string) {
  localStorage.setItem(DOC_PREFIX + roomId, text);
  const rooms = getSavedRooms();
  if (!rooms.includes(roomId)) { rooms.push(roomId); saveRooms(rooms); }
}
function loadDoc(roomId: string): string | null { return localStorage.getItem(DOC_PREFIX + roomId); }
function deleteDoc(roomId: string) {
  localStorage.removeItem(DOC_PREFIX + roomId);
  saveRooms(getSavedRooms().filter(r => r !== roomId));
}

function computeEdit(oldText: string, newText: string) {
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) start++;
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) { oldEnd--; newEnd--; }
  return { start, deletedLen: oldEnd - start, insertedLen: newEnd - start };
}

function adjustPos(pos: number, start: number, deletedLen: number, insertedLen: number) {
  if (pos <= start) return pos;
  if (pos <= start + deletedLen) return start + insertedLen;
  return pos + (insertedLen - deletedLen);
}

export function useCollab(
  content: string,
  onRemoteChange: (text: string) => void,
  username: string,
): [CollabState, CollabActions] {
  const [state, setState] = useState<CollabState>({
    isConnected: false, roomId: null, peerCount: 0, error: null, savedRooms: [],
  });
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const isRemoteRef = useRef(false);
  const contentRef = useRef(content);
  const prevContentRef = useRef(content);
  const roomIdRef = useRef<string | null>(null);
  const peerColorRef = useRef<string>(CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]);
  const onRemoteChangeRef = useRef(onRemoteChange);
  const usernameRef = useRef(username);

  contentRef.current = content;
  onRemoteChangeRef.current = onRemoteChange;
  usernameRef.current = username;

  useEffect(() => {
    setState(prev => ({ ...prev, savedRooms: getSavedRooms() }));
  }, []);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'username', username }));
    }
  }, [username]);

  function processMessage(msg: Record<string, unknown>) {
    switch (msg.type) {
      case 'connected':
        break;

      case 'room-created': {
        const roomId = msg.roomId as string;
        const docContent = (msg.content as string) || '';
        roomIdRef.current = roomId;
        contentRef.current = docContent;
        prevContentRef.current = docContent;
        if (docContent) {
          isRemoteRef.current = true;
          onRemoteChangeRef.current(docContent);
          requestAnimationFrame(() => { isRemoteRef.current = false; });
        }
        saveDoc(roomId, docContent);
        setState({
          isConnected: true,
          roomId,
          peerCount: 0,
          error: null,
          savedRooms: getSavedRooms(),
        });
        break;
      }

      case 'room-joined': {
        const roomId = msg.roomId as string;
        roomIdRef.current = roomId;
        if (!loadDoc(roomId)) {
          saveDoc(roomId, contentRef.current);
        }
        setState(prev => ({
          ...prev,
          isConnected: true,
          roomId,
          peerCount: 0,
          error: null,
          savedRooms: getSavedRooms(),
        }));
        break;
      }

      case 'room-restored': {
        const roomId = msg.roomId as string;
        const docContent = (msg.content as string) || '';
        roomIdRef.current = roomId;
        contentRef.current = docContent;
        prevContentRef.current = docContent;
        if (docContent) {
          isRemoteRef.current = true;
          onRemoteChangeRef.current(docContent);
          requestAnimationFrame(() => { isRemoteRef.current = false; });
        }
        saveDoc(roomId, docContent);
        setState({
          isConnected: true,
          roomId,
          peerCount: msg.peerCount as number || 0,
          error: null,
          savedRooms: getSavedRooms(),
        });
        break;
      }

      case 'peer-connected':
        setState(prev => ({ ...prev, peerCount: msg.peerCount as number }));
        break;

      case 'peer-disconnected':
        setState(prev => ({ ...prev, peerCount: msg.peerCount as number }));
        setRemoteCursors(prev => prev.filter(c => c.peerId !== msg.peerId));
        break;

      case 'remote-change': {
        isRemoteRef.current = true;
        const text = msg.text as string;
        if (typeof msg.editStart === 'number' && typeof msg.editDeletedLen === 'number' && typeof msg.editInsertedLen === 'number') {
          setRemoteCursors(prev => prev.map(c => ({
            ...c,
            position: adjustPos(c.position, msg.editStart as number, msg.editDeletedLen as number, msg.editInsertedLen as number),
          })));
        }
        onRemoteChangeRef.current(text);
        prevContentRef.current = text;
        contentRef.current = text;
        if (roomIdRef.current) saveDoc(roomIdRef.current, text);
        requestAnimationFrame(() => { isRemoteRef.current = false; });
        break;
      }

      case 'remote-cursor': {
        const peerId = (msg.peerId as string) || 'unknown';
        const color = (msg.color as string) || CURSOR_COLORS[0];
        const name = (msg.name as string) || peerId;
        setRemoteCursors(prev => {
          const filtered = prev.filter(c => c.peerId !== peerId);
          return [...filtered, { peerId, position: (msg.position as number) ?? 0, color, name }];
        });
        break;
      }

      case 'left':
        setState(prev => ({
          ...prev,
          isConnected: false,
          roomId: null,
          peerCount: 0,
          savedRooms: getSavedRooms(),
        }));
        setRemoteCursors([]);
        roomIdRef.current = null;
        break;
    }
  }

  useEffect(() => {
    const ws = new WebSocket(SIDECAR_URL);

    ws.onopen = () => {
      console.log('Connected to Inkwell P2P sidecar');
      ws.send(JSON.stringify({ type: 'username', username: usernameRef.current }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        processMessage(msg);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      console.log('Disconnected from sidecar, reconnecting in 2s...');
      wsRef.current = null;
      setTimeout(() => {
        if (!wsRef.current) {
          const newWs = new WebSocket(SIDECAR_URL);
          reconnect(newWs);
        }
      }, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;

    return () => {
      ws.onclose = null;
      ws.close();
      wsRef.current = null;
    };
  }, []);

  function reconnect(ws: WebSocket) {
    ws.onopen = () => {
      console.log('Reconnected to Inkwell P2P sidecar');
      ws.send(JSON.stringify({ type: 'username', username: usernameRef.current }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        processMessage(msg);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      console.log('Disconnected from sidecar, reconnecting in 2s...');
      wsRef.current = null;
      setTimeout(() => {
        if (!wsRef.current) {
          const newWs = new WebSocket(SIDECAR_URL);
          reconnect(newWs);
        }
      }, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }

  const sendToSidecar = useCallback((msg: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const createRoom = useCallback(() => {
    setRemoteCursors([]);
    sendToSidecar({ type: 'create', content: contentRef.current });
  }, [sendToSidecar]);

  const createRoomFromDoc = useCallback((oldRoomId: string) => {
    const savedContent = loadDoc(oldRoomId) || '';
    setRemoteCursors([]);
    sendToSidecar({ type: 'create', content: savedContent });
  }, [sendToSidecar]);

  const joinRoom = useCallback((id: string) => {
    setRemoteCursors([]);
    sendToSidecar({ type: 'join', roomId: id, content: contentRef.current });
  }, [sendToSidecar]);

  const disconnect = useCallback(() => {
    if (roomIdRef.current) saveDoc(roomIdRef.current, contentRef.current);
    sendToSidecar({ type: 'leave' });
  }, [sendToSidecar]);

  const deleteRoom = useCallback((id: string) => {
    deleteDoc(id);
    setState(prev => ({ ...prev, savedRooms: getSavedRooms() }));
  }, []);

  const broadcastChange = useCallback((text: string) => {
    if (isRemoteRef.current) return;
    const prev = prevContentRef.current;
    const { start, deletedLen, insertedLen } = computeEdit(prev, text);
    setRemoteCursors(prev2 => prev2.map(c => ({
      ...c,
      position: adjustPos(c.position, start, deletedLen, insertedLen),
    })));
    prevContentRef.current = text;
    if (roomIdRef.current) saveDoc(roomIdRef.current, text);
    sendToSidecar({
      type: 'change',
      text,
      editStart: start,
      editDeletedLen: deletedLen,
      editInsertedLen: insertedLen,
    });
  }, [sendToSidecar]);

  const broadcastCursor = useCallback((position: number) => {
    sendToSidecar({
      type: 'cursor',
      position,
      color: peerColorRef.current,
    });
  }, [sendToSidecar]);

  return [state, { createRoom, createRoomFromDoc, joinRoom, disconnect, broadcastChange, broadcastCursor, remoteCursors, deleteRoom }];
}