# Hook useCollab — Documentación Detallada

**Ruta:** `src/hooks/useCollab.ts`

## Firma

```typescript
function useCollab(
  content: string,
  onRemoteChange: (text: string) => void,
  username: string,
): [CollabState, CollabActions]
```

### Parámetros

| Parámetro | Tipo | Descripción |
|---|---|---|
| `content` | `string` | Contenido actual del documento |
| `onRemoteChange` | `(text: string) => void` | Callback al recibir cambio remoto |
| `username` | `string` | Nombre del usuario (para cursores remotos) |

### Retorno

Tupla `[state, actions]` al estilo `useReducer`.

## CollabState

```typescript
interface CollabState {
  isConnected: boolean;   // true si está conectado a una sala
  roomId: string | null;  // ID de la sala actual
  peerCount: number;      // Número de peers conectados
  error: string | null;   // Último error
  savedRooms: string[];   // Salas guardadas en localStorage
}
```

## CollabActions

```typescript
interface CollabActions {
  createRoom: () => void;                        // Crear nueva sala
  createRoomFromDoc: (roomId: string) => void;   // Crear sala desde doc guardado
  joinRoom: (id: string) => void;                // Unirse a sala existente
  disconnect: () => void;                        // Desconectarse
  broadcastChange: (text: string) => void;       // Enviar cambio al sidecar
  broadcastCursor: (position: number) => void;   // Enviar posición del cursor
  remoteCursors: RemoteCursor[];                 // Cursores remotos
  deleteRoom: (id: string) => void;              // Eliminar sala guardada
}
```

## Refs Internos

| Ref | Tipo | Propósito |
|---|---|---|
| `wsRef` | `WebSocket \| null` | Conexión WebSocket al sidecar |
| `isRemoteRef` | `boolean` | Flag para evitar re-broadcast de cambios remotos |
| `contentRef` | `string` | Contenido más reciente (evitar stale closures) |
| `prevContentRef` | `string` | Contenido anterior (para calcular diff) |
| `roomIdRef` | `string \| null` | ID de la sala actual |
| `peerColorRef` | `string` | Color asignado a este peer |
| `onRemoteChangeRef` | `function` | Callback actualizado sin re-crear el effect |
| `usernameRef` | `string` | Username actualizado sin re-crear el effect |

### ¿Por qué refs en vez de estado?

Los refs evitan **stale closures** sin causar re-renders. `onRemoteChangeRef.current` siempre tiene el callback más reciente, incluso dentro de closures creados en renders anteriores. Esto es crítico porque el `useEffect` del WebSocket tiene dependencias vacías `[]` — sin refs, el callback se quedaría obsoleto.

## Funciones Auxiliares

### `computeEdit`

Calcula el diff entre texto antiguo y nuevo:

```typescript
function computeEdit(oldText: string, newText: string) {
  let start = 0;
  while (start < oldText.length && start < newText.length
         && oldText[start] === newText[start]) start++;

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start
         && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  return { start, deletedLen: oldEnd - start, insertedLen: newEnd - start };
}
```

### `adjustPos`

Ajusta posición de cursor basada en un edit:

```typescript
function adjustPos(pos, start, deletedLen, insertedLen) {
  if (pos <= start) return pos;
  if (pos <= start + deletedLen) return start + insertedLen;
  return pos + (insertedLen - deletedLen);
}
```

## Funciones de Persistencia

```typescript
const ROOMS_KEY = 'inkwell-rooms';
const DOC_PREFIX = 'inkwell-doc-';

function saveDoc(roomId: string, text: string) {
  localStorage.setItem(DOC_PREFIX + roomId, text);
  const rooms = getSavedRooms();
  if (!rooms.includes(roomId)) { rooms.push(roomId); saveRooms(rooms); }
}

function loadDoc(roomId: string): string | null {
  return localStorage.getItem(DOC_PREFIX + roomId);
}

function deleteDoc(roomId: string) {
  localStorage.removeItem(DOC_PREFIX + roomId);
  saveRooms(getSavedRooms().filter(r => r !== roomId));
}
```

## WebSocket: Conexión y Reconexión

### Conexión Inicial

```typescript
useEffect(() => {
  const ws = new WebSocket(SIDECAR_URL);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'username', username: usernameRef.current }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    processMessage(msg);
  };

  ws.onclose = () => {
    wsRef.current = null;
    setTimeout(() => {
      if (!wsRef.current) {
        const newWs = new WebSocket(SIDECAR_URL);
        reconnect(newWs);
      }
    }, 2000);
  };

  wsRef.current = ws;

  return () => {
    ws.onclose = null;
    ws.close();
    wsRef.current = null;
  };
}, []); // Dependencias vacías — no se reconecta por cambios de estado
```

### Reconexión Automática

```typescript
function reconnect(ws: WebSocket) {
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'username', username: usernameRef.current }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    processMessage(msg);
  };

  ws.onclose = () => {
    wsRef.current = null;
    setTimeout(() => {
      if (!wsRef.current) {
        const newWs = new WebSocket(SIDECAR_URL);
        reconnect(newWs);
      }
    }, 2000);
  };

  wsRef.current = ws;
}
```

### Actualización de Username

```typescript
useEffect(() => {
  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
    wsRef.current.send(JSON.stringify({ type: 'username', username }));
  }
}, [username]); // Solo envía el nuevo username, no reconecta
```

## Procesamiento de Mensajes

### `processMessage`

Función interna que maneja todos los tipos de mensaje del sidecar:

```typescript
function processMessage(msg: Record<string, unknown>) {
  switch (msg.type) {
    case 'room-created':
      // Sala creada → actualizar estado, contenido, refs
      roomIdRef.current = msg.roomId;
      contentRef.current = msg.content;
      prevContentRef.current = msg.content;
      if (msg.content) {
        isRemoteRef.current = true;
        onRemoteChangeRef.current(msg.content);
        requestAnimationFrame(() => { isRemoteRef.current = false; });
      }
      saveDoc(msg.roomId, msg.content);
      setState({ isConnected: true, roomId: msg.roomId, peerCount: 0, ... });
      break;

    case 'room-joined':
      // Unión exitosa → actualizar estado
      roomIdRef.current = msg.roomId;
      if (!loadDoc(msg.roomId)) saveDoc(msg.roomId, contentRef.current);
      setState(prev => ({ ...prev, isConnected: true, roomId: msg.roomId, ... }));
      break;

    case 'room-restored':
      // Reconexión con sala activa → restaurar contenido
      roomIdRef.current = msg.roomId;
      contentRef.current = msg.content;
      prevContentRef.current = msg.content;
      if (msg.content) {
        isRemoteRef.current = true;
        onRemoteChangeRef.current(msg.content);
        requestAnimationFrame(() => { isRemoteRef.current = false; });
      }
      saveDoc(msg.roomId, msg.content);
      setState({ isConnected: true, roomId: msg.roomId, peerCount: msg.peerCount, ... });
      break;

    case 'peer-connected':
      setState(prev => ({ ...prev, peerCount: msg.peerCount }));
      break;

    case 'peer-disconnected':
      setState(prev => ({ ...prev, peerCount: msg.peerCount }));
      setRemoteCursors(prev => prev.filter(c => c.peerId !== msg.peerId));
      break;

    case 'remote-change':
      // Cambio recibido de otro peer
      isRemoteRef.current = true;
      if (msg.editStart !== undefined) {
        setRemoteCursors(prev => prev.map(c => ({
          ...c,
          position: adjustPos(c.position, msg.editStart, msg.editDeletedLen, msg.editInsertedLen),
        })));
      }
      onRemoteChangeRef.current(msg.text);
      prevContentRef.current = msg.text;
      contentRef.current = msg.text;
      if (roomIdRef.current) saveDoc(roomIdRef.current, msg.text);
      requestAnimationFrame(() => { isRemoteRef.current = false; });
      break;

    case 'remote-cursor':
      // Cursor remoto recibido
      setRemoteCursors(prev => {
        const filtered = prev.filter(c => c.peerId !== msg.peerId);
        return [...filtered, { peerId, position: msg.position, color, name }];
      });
      break;

    case 'left':
      // Salida de sala
      setState(prev => ({ ...prev, isConnected: false, roomId: null, peerCount: 0 }));
      setRemoteCursors([]);
      roomIdRef.current = null;
      break;
  }
}
```

## Acciones

### `createRoom`

```typescript
const createRoom = useCallback(() => {
  setRemoteCursors([]);
  sendToSidecar({ type: 'create', content: contentRef.current });
}, [sendToSidecar]);
```

### `joinRoom`

```typescript
const joinRoom = useCallback((id: string) => {
  setRemoteCursors([]);
  sendToSidecar({ type: 'join', roomId: id, content: contentRef.current });
}, [sendToSidecar]);
```

### `disconnect`

```typescript
const disconnect = useCallback(() => {
  if (roomIdRef.current) saveDoc(roomIdRef.current, contentRef.current);
  sendToSidecar({ type: 'leave' });
}, [sendToSidecar]);
```

### `broadcastChange`

```typescript
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
```

### `broadcastCursor`

```typescript
const broadcastCursor = useCallback((position: number) => {
  sendToSidecar({
    type: 'cursor',
    position,
    color: peerColorRef.current,
  });
}, [sendToSidecar]);
```

### `sendToSidecar`

```typescript
const sendToSidecar = useCallback((msg: object) => {
  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
    wsRef.current.send(JSON.stringify(msg));
  }
}, []);
```

## Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────┐
│                      useCollab Hook                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  createRoom() ──┐                                            │
│  joinRoom()     ├──▶ sendToSidecar() ──▶ WebSocket ──▶ Sidecar│
│  disconnect()   │                                            │
│  broadcastChange│                                            │
│  broadcastCursor┘                                            │
│                                                               │
│  useEffect([]) ──▶ new WebSocket(SIDECAR_URL)                │
│       │                                                       │
│       ├── onopen ──▶ send username                           │
│       ├── onmessage ──▶ processMessage(msg)                   │
│       │     ├── 'room-created' ──▶ setState(connected)        │
│       │     ├── 'room-joined'  ──▶ setState(connected)        │
│       │     ├── 'room-restored'─▶ setState(connected+content) │
│       │     ├── 'remote-change'──▶ onRemoteChange(text)       │
│       │     ├── 'remote-cursor'──▶ setRemoteCursors()         │
│       │     ├── 'peer-connected'─▶ setState(peerCount++)      │
│       │     └── 'left'          ──▶ setState(disconnected)    │
│       └── onclose ──▶ setTimeout(reconnect, 2000)             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```
