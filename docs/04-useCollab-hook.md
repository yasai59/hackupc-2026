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
| `content` | `string` | El contenido actual del documento (desde el estado del componente padre) |
| `onRemoteChange` | `(text: string) => void` | Callback para actualizar el contenido cuando llega un cambio remoto |
| `username` | `string` | Nombre del usuario actual (para mostrar en cursores remotos) |

### Retorno

Tupla `[state, actions]` al estilo `useReducer`.

## CollabState

```typescript
interface CollabState {
  isConnected: boolean;   // true si está conectado a una sala
  roomId: string | null;  // ID de la sala actual (ej: "inkwell-abc123")
  peerCount: number;      // Número de peers conectados actualmente
  error: string | null;   // Tipo del último error de PeerJS
  savedRooms: string[];   // Lista de roomIds guardados en localStorage
}
```

## CollabActions

```typescript
interface CollabActions {
  createRoom: () => void;                        // Crear nueva sala como host
  createRoomFromDoc: (roomId: string) => void;   // Crear sala desde doc guardado
  joinRoom: (id: string) => void;                // Unirse a sala existente
  disconnect: () => void;                        // Desconectarse de la sala
  broadcastChange: (text: string) => void;       // Enviar cambio a todos los peers
  broadcastCursor: (position: number) => void;   // Enviar posición del cursor
  remoteCursors: RemoteCursor[];                 // Cursores de peers remotos
  deleteRoom: (id: string) => void;              // Eliminar sala guardada
}
```

## RemoteCursor

```typescript
interface RemoteCursor {
  peerId: string;    // ID único del peer remoto
  position: number;  // Posición del cursor en el texto
  color: string;     // Color asignado (de CURSOR_COLORS)
  name: string;      // Nombre del usuario remoto
}
```

## Refs Internos

| Ref | Tipo | Propósito |
|---|---|---|
| `peerRef` | `Peer \| null` | Instancia actual de PeerJS |
| `connectionsRef` | `Map<string, DataConnection>` | Mapa de conexiones activas (peerId → conexión) |
| `isRemoteRef` | `boolean` | Flag para evitar re-broadcast de cambios remotos |
| `contentRef` | `string` | Ref al contenido más reciente (ev stale closures) |
| `prevContentRef` | `string` | Contenido anterior (para calcular diff) |
| `roomIdRef` | `string \| null` | ID de la sala actual (accesible en callbacks) |
| `peerColorRef` | `string` | Color asignado a este peer |
| `myIdRef` | `string` | ID de este peer |

### ¿Por qué usar refs en vez de estado?

Los refs se usan para valores que necesitan ser accesibles dentro de callbacks sin causar re-renders ni problemas de stale closures. Por ejemplo, `contentRef.current` siempre tiene el valor más reciente del contenido, incluso dentro de closures creados en renders anteriores.

## Funciones Auxiliares

### `computeEdit`

Calcula el diff entre el texto antiguo y el nuevo:

```typescript
function computeEdit(oldText: string, newText: string) {
  let start = 0;
  // Avanzar desde el inicio mientras los caracteres coincidan
  while (start < oldText.length && start < newText.length
         && oldText[start] === newText[start]) start++;

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  // Retroceder desde el final mientras los caracteres coincidan
  while (oldEnd > start && newEnd > start
         && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  return {
    start,
    deletedLen: oldEnd - start,
    insertedLen: newEnd - start
  };
}
```

**Ejemplo visual:**
```
oldText: "Hello world!"
newText: "Hello beautiful world!"
         012345|6789012345678901234
               ↑ start=6

oldEnd=12, newEnd=22 (desde el final, "!" coincide)

Resultado: { start: 6, deletedLen: 0, insertedLen: 10 }
```

### `adjustPos`

Ajusta una posición de cursor basada en un edit:

```typescript
function adjustPos(pos, start, deletedLen, insertedLen) {
  if (pos <= start) return pos;                        // Antes del cambio
  if (pos <= start + deletedLen) return start + insertedLen; // Dentro del borrado
  return pos + (insertedLen - deletedLen);             // Después del cambio
}
```

**Casos:**
```
Texto: "Hello world"
Cursor en posición 3 ("l"):

Caso 1 - Insertar en posición 6:
  adjustPos(3, 6, 0, 10) → 3 (no se mueve, está antes)

Caso 2 - Insertar en posición 2:
  adjustPos(3, 2, 0, 5) → 3 + (5 - 0) = 8

Caso 3 - Borrar "world" (pos 6-11) e insertar "Earth" (5 chars):
  adjustPos(8, 6, 5, 5) → 6 + 5 = 11 → pero está dentro del borrado
  → 6 + 5 = 11 (se mueve al final del insertado)
```

## Funciones de Persistencia

### localStorage Keys

```typescript
const ROOMS_KEY = 'inkwell-rooms';       // Lista de salas guardadas
const DOC_PREFIX = 'inkwell-doc-';       // Prefijo para documentos
```

### Funciones

```typescript
function getSavedRooms(): string[] {
  try { return JSON.parse(localStorage.getItem(ROOMS_KEY) || '[]'); }
  catch { return []; }
}

function saveRooms(rooms: string[]) {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
}

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

## Acciones Principales

### createRoom

Crea una nueva sala como host:

```typescript
const createRoom = useCallback(() => {
  // 1. Limpiar conexión anterior
  if (peerRef.current) peerRef.current.destroy();
  connectionsRef.current.clear();
  setRemoteCursors([]);

  // 2. Generar ID único
  const id = 'inkwell-' + Math.random().toString(36).slice(2, 8);
  // Ejemplo: "inkwell-x7k2m9"

  // 3. Crear Peer con ese ID
  const peer = new Peer(id);
  myIdRef.current = id;

  // 4. Cuando el peer está listo
  peer.on('open', () => {
    roomIdRef.current = id;
    saveDoc(id, contentRef.current); // Guardar documento actual
    setState({ isConnected: true, roomId: id, peerCount: 0, error: null, savedRooms: getSavedRooms() });
  });

  // 5. Escuchar conexiones entrantes
  peer.on('connection', (conn) => { setupConnection(conn); });

  // 6. Manejar errores
  peer.on('error', (err) => { setState(prev => ({ ...prev, error: err.type })); });

  peerRef.current = peer;
  prevContentRef.current = contentRef.current;
}, [setupConnection]);
```

### joinRoom

Se une a una sala existente:

```typescript
const joinRoom = useCallback((id: string) => {
  // 1. Limpiar conexión anterior
  if (peerRef.current) peerRef.current.destroy();
  connectionsRef.current.clear();
  setRemoteCursors([]);

  // 2. Crear Peer con ID auto-generado
  const peer = new Peer();

  // 3. Cuando el peer está listo
  peer.on('open', () => {
    myIdRef.current = peer.id;

    // 4. Conectar al host
    const conn = peer.connect(id, { reliable: true });

    conn.on('open', () => {
      roomIdRef.current = id;
      if (!loadDoc(id)) saveDoc(id, contentRef.current);
      setState({ isConnected: true, roomId: id, peerCount: 1, error: null, savedRooms: getSavedRooms() });
    });

    setupConnection(conn);
  });

  // 5. También escuchar conexiones entrantes (para mesh)
  peer.on('connection', (conn) => { setupConnection(conn, true); });

  peer.on('error', (err) => { setState(prev => ({ ...prev, error: err.type })); });

  peerRef.current = peer;
  prevContentRef.current = contentRef.current;
}, [setupConnection]);
```

### createRoomFromDoc

Crea una nueva sala con el contenido de un documento guardado:

```typescript
const createRoomFromDoc = useCallback((oldRoomId: string) => {
  const savedContent = loadDoc(oldRoomId) || '';

  // Destruir conexión anterior
  if (peerRef.current) peerRef.current.destroy();
  connectionsRef.current.clear();
  setRemoteCursors([]);

  // Crear nuevo peer
  const id = 'inkwell-' + Math.random().toString(36).slice(2, 8);
  const peer = new Peer(id);
  myIdRef.current = id;

  peer.on('open', () => {
    roomIdRef.current = id;
    saveDoc(id, savedContent);
    onRemoteChange(savedContent);     // Cargar contenido en el editor
    prevContentRef.current = savedContent;
    contentRef.current = savedContent;
    setState({ isConnected: true, roomId: id, peerCount: 0, error: null, savedRooms: getSavedRooms() });
  });

  peer.on('connection', (conn) => { setupConnection(conn); });
  peer.on('error', (err) => { setState(prev => ({ ...prev, error: err.type })); });

  peerRef.current = peer;
}, [setupConnection, onRemoteChange]);
```

### disconnect

Desconecta de la sala actual:

```typescript
const disconnect = useCallback(() => {
  if (roomIdRef.current) saveDoc(roomIdRef.current, contentRef.current);
  if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
  connectionsRef.current.clear();
  setRemoteCursors([]);
  roomIdRef.current = null;
  setState({ isConnected: false, roomId: null, peerCount: 0, error: null, savedRooms: getSavedRooms() });
}, []);
```

### broadcastChange

Envía un cambio de texto a todos los peers conectados:

```typescript
const broadcastChange = useCallback((text: string) => {
  // No re-broadcastear cambios que vinieron de otro peer
  if (isRemoteRef.current) return;

  // Calcular diff
  const prev = prevContentRef.current;
  const { start, deletedLen, insertedLen } = computeEdit(prev, text);

  // Ajustar cursores locales
  shiftCursors(start, deletedLen, insertedLen);

  // Actualizar refs
  prevContentRef.current = text;

  // Guardar
  if (roomIdRef.current) saveDoc(roomIdRef.current, text);

  // Enviar a todos los peers
  broadcastToAll({
    type: 'change',
    text,
    editStart: start,
    editDeletedLen: deletedLen,
    editInsertedLen: insertedLen
  });
}, [shiftCursors, broadcastToAll]);
```

### broadcastCursor

Envía la posición actual del cursor:

```typescript
const broadcastCursor = useCallback((position: number) => {
  broadcastToAll({
    type: 'cursor',
    position,
    peerId: myIdRef.current,
    color: peerColorRef.current,
    name: username
  });
}, [username, broadcastToAll]);
```

## Gestión de Conexiones

### setupConnection

Configura una nueva conexión peer:

```typescript
const setupConnection = useCallback((conn: DataConnection, skipSync?: boolean) => {
  // Evitar duplicados
  if (connectionsRef.current.has(conn.peer)) return;

  // Registrar
  connectionsRef.current.set(conn.peer, conn);
  updatePeerCount();

  // Handler de datos
  conn.on('data', (data) => handleData(conn.peer, data));

  // Cuando se abre
  conn.on('open', () => {
    if (!skipSync) {
      conn.send({ type: 'sync-request', text: '' });
    }
    sendPeerList(conn);
    broadcastToAll({ type: 'peer-list', peers: Array.from(connectionsRef.current.keys()) });
  });

  // Cuando se cierra
  conn.on('close', () => {
    connectionsRef.current.delete(conn.peer);
    setRemoteCursors(prev => prev.filter(c => c.peerId !== conn.peer));
    updatePeerCount();
  });

  // Error
  conn.on('error', () => {
    connectionsRef.current.delete(conn.peer);
    setRemoteCursors(prev => prev.filter(c => c.peerId !== conn.peer));
    updatePeerCount();
  });
}, [handleData, updatePeerCount, sendPeerList, broadcastToAll]);
```

### handleData

Procesa los mensajes entrantes:

```typescript
const handleData = useCallback((connPeerId: string, data: unknown) => {
  const msg = data as Record<string, unknown>;

  // --- CHANGE ---
  if (msg.type === 'change') {
    isRemoteRef.current = true;

    // Ajustar cursores si hay diff
    if (typeof msg.editStart === 'number' && typeof msg.editDeletedLen === 'number' && typeof msg.editInsertedLen === 'number') {
      shiftCursors(msg.editStart as number, msg.editDeletedLen as number, msg.editInsertedLen as number);
    }

    // Actualizar contenido
    onRemoteChange(msg.text as string);
    prevContentRef.current = msg.text as string;
    contentRef.current = msg.text as string;

    // Guardar
    if (roomIdRef.current) saveDoc(roomIdRef.current, msg.text as string);

    // Desmarcar en el siguiente frame
    requestAnimationFrame(() => { isRemoteRef.current = false; });
  }

  // --- SYNC REQUEST ---
  if (msg.type === 'sync-request') {
    const conn = connectionsRef.current.get(connPeerId);
    if (conn && conn.open) {
      conn.send({ type: 'sync-response', text: contentRef.current });
    }
  }

  // --- SYNC RESPONSE ---
  if (msg.type === 'sync-response') {
    isRemoteRef.current = true;
    onRemoteChange(msg.text as string);
    prevContentRef.current = msg.text as string;
    contentRef.current = msg.text as string;
    if (roomIdRef.current) saveDoc(roomIdRef.current, msg.text as string);
    requestAnimationFrame(() => { isRemoteRef.current = false; });
  }

  // --- CURSOR ---
  if (msg.type === 'cursor' && msg.peerId && msg.color) {
    const peerId = msg.peerId as string;
    const color = msg.color as string;
    const name = (msg.name as string) || peerId;

    setRemoteCursors(prev => {
      const filtered = prev.filter(c => c.peerId !== peerId);
      return [...filtered, { peerId, position: (msg.position as number) ?? 0, color, name }];
    });
  }

  // --- PEER LIST ---
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
```

### broadcastToAll

Envía un mensaje a todas las conexiones activas:

```typescript
const broadcastToAll = useCallback((msg: object) => {
  connectionsRef.current.forEach((conn) => {
    if (conn.open) conn.send(msg);
  });
}, []);
```

### sendPeerList

Envía la lista de peers conocidos a una conexión específica:

```typescript
const sendPeerList = useCallback((conn: DataConnection) => {
  const peers = Array.from(connectionsRef.current.keys());
  conn.send({ type: 'peer-list', peers });
}, []);
```

### shiftCursors

Ajusta todas las posiciones de cursores remotos:

```typescript
const shiftCursors = useCallback((start, deletedLen, insertedLen) => {
  setRemoteCursors(prev => prev.map(c => ({
    ...c,
    position: adjustPos(c.position, start, deletedLen, insertedLen),
  })));
}, []);
```

### updatePeerCount

Actualiza el contador de peers en el estado:

```typescript
const updatePeerCount = useCallback(() => {
  setState(prev => ({ ...prev, peerCount: connectionsRef.current.size }));
}, []);
```

## Ciclo de Vida

### Inicialización

```typescript
useEffect(() => {
  setState(prev => ({ ...prev, savedRooms: getInitialRooms() }));
}, []);
```

Al montar, carga las salas guardadas de localStorage.

### Cleanup

```typescript
useEffect(() => {
  return () => {
    if (roomIdRef.current) saveDoc(roomIdRef.current, contentRef.current);
    if (peerRef.current) peerRef.current.destroy();
  };
}, []);
```

Al desmontar:
1. Guarda el documento actual
2. Destruye la instancia Peer (cierra todas las conexiones)

## Diagrama de Flujo Completo

```
┌─────────────────────────────────────────────────────────────┐
│                      useCollab Hook                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  createRoom() ──────────────────────────┐                    │
│  joinRoom(id) ─────────────────────────┤                    │
│  createRoomFromDoc(id) ────────────────┤                    │
│                                         ▼                    │
│                              ┌─────────────────────┐         │
│                              │   new Peer(id)      │         │
│                              │   PeerJS instance   │         │
│                              └─────────┬───────────┘         │
│                                        │                     │
│                    ┌───────────────────┼───────────────────┐ │
│                    ▼                   ▼                   ▼ │
│           peer.on('open')    peer.on('connection')  peer.on('error')
│                    │                   │                   │ │
│                    ▼                   ▼                   ▼ │
│           setState(connected)   setupConnection()    setState(error)
│                                        │                     │
│                           ┌────────────┼────────────┐       │
│                           ▼            ▼            ▼       │
│                    conn.on('open') conn.on('data') conn.on('close')
│                           │            │            │       │
│                           ▼            ▼            ▼       │
│                    sync-request   handleData()   delete conn │
│                    peer-list      (msg types)    update count│
│                                        │                     │
│                           ┌────────────┼────────────┐       │
│                           ▼            ▼            ▼       │
│                      'change'      'cursor'     'peer-list' │
│                      'sync-req'    'sync-res'              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```
