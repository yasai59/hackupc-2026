import { useState, useCallback, useRef, useEffect } from 'react';
import Peer from 'peerjs';

type DataConnection = ReturnType<InstanceType<typeof Peer>['connect']>;

const CURSOR_COLORS = ['#c45d3e', '#2d8a4e', '#4a6fa5', '#9b59b6', '#e67e22', '#1abc9c', '#e74c3c', '#3498db'];

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

function getInitialRooms(): string[] {
  if (typeof window === 'undefined') return [];
  return getSavedRooms();
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

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const isRemoteRef = useRef(false);
  const contentRef = useRef(content);
  const prevContentRef = useRef(content);
  const roomIdRef = useRef<string | null>(null);
  const peerColorRef = useRef<string>(CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]);
  const myIdRef = useRef<string>('');
  contentRef.current = content;

  useEffect(() => {
    setState(prev => ({ ...prev, savedRooms: getInitialRooms() }));
  }, []);

  const shiftCursors = useCallback((start: number, deletedLen: number, insertedLen: number) => {
    setRemoteCursors(prev => prev.map(c => ({
      ...c, position: adjustPos(c.position, start, deletedLen, insertedLen),
    })));
  }, []);

  const updatePeerCount = useCallback(() => {
    setState(prev => ({ ...prev, peerCount: connectionsRef.current.size }));
  }, []);

  const broadcastToAll = useCallback((msg: object) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) conn.send(msg);
    });
  }, []);

  const sendPeerList = useCallback((conn: DataConnection) => {
    const peers = Array.from(connectionsRef.current.keys());
    conn.send({ type: 'peer-list', peers });
  }, []);

  const handleData = useCallback((connPeerId: string, data: unknown) => {
    const msg = data as Record<string, unknown>;

    if (msg.type === 'change') {
      isRemoteRef.current = true;
      if (typeof msg.editStart === 'number' && typeof msg.editDeletedLen === 'number' && typeof msg.editInsertedLen === 'number') {
        shiftCursors(msg.editStart as number, msg.editDeletedLen as number, msg.editInsertedLen as number);
      }
      onRemoteChange(msg.text as string);
      prevContentRef.current = msg.text as string;
      contentRef.current = msg.text as string;
      if (roomIdRef.current) saveDoc(roomIdRef.current, msg.text as string);
      requestAnimationFrame(() => { isRemoteRef.current = false; });
    }

    if (msg.type === 'sync-request') {
      connPeerId;
      const conn = connectionsRef.current.get(connPeerId);
      if (conn && conn.open) {
        conn.send({ type: 'sync-response', text: contentRef.current });
      }
    }

    if (msg.type === 'sync-response') {
      isRemoteRef.current = true;
      onRemoteChange(msg.text as string);
      prevContentRef.current = msg.text as string;
      contentRef.current = msg.text as string;
      if (roomIdRef.current) saveDoc(roomIdRef.current, msg.text as string);
      requestAnimationFrame(() => { isRemoteRef.current = false; });
    }

    if (msg.type === 'cursor' && msg.peerId && msg.color) {
      const peerId = msg.peerId as string;
      const color = msg.color as string;
      const name = (msg.name as string) || peerId;
      setRemoteCursors(prev => {
        const filtered = prev.filter(c => c.peerId !== peerId);
        return [...filtered, { peerId, position: (msg.position as number) ?? 0, color, name }];
      });
    }

    if (msg.type === 'peer-list') {
      const peers = msg.peers as string[];
      const myId = myIdRef.current;
      const alreadyConnected = Array.from(connectionsRef.current.keys());
      const p = peerRef.current;
      if (!p || p.destroyed) return;
      for (const peerId of peers) {
        if (peerId !== myId && !alreadyConnected.includes(peerId)) {
          try {
            const c = p.connect(peerId, { reliable: true });
            setupConnection(c, true);
          } catch { /* peer might not exist yet */ }
        }
      }
    }
  }, [onRemoteChange, shiftCursors]);

  const setupConnection = useCallback((conn: DataConnection, skipSync?: boolean) => {
    if (connectionsRef.current.has(conn.peer)) return;
    connectionsRef.current.set(conn.peer, conn);
    updatePeerCount();

    conn.on('data', (data) => handleData(conn.peer, data));

    conn.on('open', () => {
      if (!skipSync) {
        conn.send({ type: 'sync-request', text: '' });
      }
      sendPeerList(conn);
      broadcastToAll({ type: 'peer-list', peers: Array.from(connectionsRef.current.keys()) });
    });

    conn.on('close', () => {
      connectionsRef.current.delete(conn.peer);
      setRemoteCursors(prev => prev.filter(c => c.peerId !== conn.peer));
      updatePeerCount();
    });

    conn.on('error', () => {
      connectionsRef.current.delete(conn.peer);
      setRemoteCursors(prev => prev.filter(c => c.peerId !== conn.peer));
      updatePeerCount();
    });
  }, [handleData, updatePeerCount, sendPeerList, broadcastToAll]);

  const createRoom = useCallback(() => {
    if (peerRef.current) peerRef.current.destroy();
    connectionsRef.current.clear();
    setRemoteCursors([]);

    const id = 'inkwell-' + Math.random().toString(36).slice(2, 8);
    const peer = new Peer(id);
    myIdRef.current = id;

    peer.on('open', () => {
      roomIdRef.current = id;
      saveDoc(id, contentRef.current);
      setState({ isConnected: true, roomId: id, peerCount: 0, error: null, savedRooms: getSavedRooms() });
    });

    peer.on('connection', (conn) => { setupConnection(conn); });

    peer.on('error', (err) => { setState(prev => ({ ...prev, error: err.type })); });

    peerRef.current = peer;
    prevContentRef.current = contentRef.current;
  }, [setupConnection]);

  const createRoomFromDoc = useCallback((oldRoomId: string) => {
    const savedContent = loadDoc(oldRoomId) || '';
    if (peerRef.current) peerRef.current.destroy();
    connectionsRef.current.clear();
    setRemoteCursors([]);

    const id = 'inkwell-' + Math.random().toString(36).slice(2, 8);
    const peer = new Peer(id);
    myIdRef.current = id;

    peer.on('open', () => {
      roomIdRef.current = id;
      saveDoc(id, savedContent);
      onRemoteChange(savedContent);
      prevContentRef.current = savedContent;
      contentRef.current = savedContent;
      setState({ isConnected: true, roomId: id, peerCount: 0, error: null, savedRooms: getSavedRooms() });
    });

    peer.on('connection', (conn) => { setupConnection(conn); });

    peer.on('error', (err) => { setState(prev => ({ ...prev, error: err.type })); });

    peerRef.current = peer;
  }, [setupConnection, onRemoteChange]);

  const joinRoom = useCallback((id: string) => {
    if (peerRef.current) peerRef.current.destroy();
    connectionsRef.current.clear();
    setRemoteCursors([]);

    const peer = new Peer();

    peer.on('open', () => {
      myIdRef.current = peer.id;
      const conn = peer.connect(id, { reliable: true });
      conn.on('open', () => {
        roomIdRef.current = id;
        if (!loadDoc(id)) saveDoc(id, contentRef.current);
        setState({ isConnected: true, roomId: id, peerCount: 1, error: null, savedRooms: getSavedRooms() });
      });
      setupConnection(conn);
    });

    peer.on('connection', (conn) => { setupConnection(conn, true); });

    peer.on('error', (err) => { setState(prev => ({ ...prev, error: err.type })); });

    peerRef.current = peer;
    prevContentRef.current = contentRef.current;
  }, [setupConnection]);

  const disconnect = useCallback(() => {
    if (roomIdRef.current) saveDoc(roomIdRef.current, contentRef.current);
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    connectionsRef.current.clear();
    setRemoteCursors([]);
    roomIdRef.current = null;
    setState({ isConnected: false, roomId: null, peerCount: 0, error: null, savedRooms: getSavedRooms() });
  }, []);

  const deleteRoom = useCallback((id: string) => {
    deleteDoc(id);
    setState(prev => ({ ...prev, savedRooms: getSavedRooms() }));
  }, []);

  const broadcastChange = useCallback((text: string) => {
    if (isRemoteRef.current) return;
    const prev = prevContentRef.current;
    const { start, deletedLen, insertedLen } = computeEdit(prev, text);
    shiftCursors(start, deletedLen, insertedLen);
    prevContentRef.current = text;
    if (roomIdRef.current) saveDoc(roomIdRef.current, text);
    broadcastToAll({ type: 'change', text, editStart: start, editDeletedLen: deletedLen, editInsertedLen: insertedLen });
  }, [shiftCursors, broadcastToAll]);

  const broadcastCursor = useCallback((position: number) => {
    broadcastToAll({ type: 'cursor', position, peerId: myIdRef.current, color: peerColorRef.current, name: username });
  }, [username, broadcastToAll]);

  useEffect(() => {
    return () => {
      if (roomIdRef.current) saveDoc(roomIdRef.current, contentRef.current);
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  return [state, { createRoom, createRoomFromDoc, joinRoom, disconnect, broadcastChange, broadcastCursor, remoteCursors, deleteRoom }];
}