# Arquitectura P2P — Colaboración en Tiempo Real

Este documento explica en profundidad cómo funciona la colaboración peer-to-peer en Inkwell, implementada con **PeerJS** (WebRTC).

## 1. Conceptos Fundamentales

### ¿Qué es WebRTC?

WebRTC (Web Real-Time Communication) es un protocolo que permite comunicación directa entre navegadores sin pasar datos por un servidor central. Ofrece:
- **Baja latencia**: los datos van directamente de peer a peer
- **Sin servidor de datos**: solo se necesita un signaling server para el handshake inicial
- **Canales de datos**: `RTCDataChannel` para transferencia arbitraria de datos

### ¿Qué es PeerJS?

PeerJS es una librería que simplifica WebRTC proporcionando una API de alto nivel:
- Gestiona el signaling automáticamente (usa el servidor público `0.peerjs.com` por defecto)
- Abstrae la complejidad de `RTCPeerConnection`
- Proporciona `DataConnection` para enviar/recibir mensajes

### Topología de Red: Mesh

Inkwell usa una **topología mesh** (malla completa): cada peer se conecta directamente a **todos** los demás peers.

```
    Peer A
   /   |   \
  /    |    \
Peer B—Peer C—Peer D
  \    |    /
   \   |   /
    Peer E
```

**Ventajas:**
- No hay punto único de fallo
- Cada peer recibe los cambios directamente del autor
- Baja latencia (sin retransmisión)

**Desventajas:**
- O(N²) conexiones: con N peers hay N*(N-1)/2 conexiones
- No escala bien más de ~10-15 peers

## 2. Tipos de Mensajes

El protocolo de comunicación define **5 tipos de mensajes**:

### `change` — Cambio de Contenido

Se envía cada vez que un usuario modifica el texto.

```typescript
{
  type: 'change',
  text: string,           // El texto completo después del cambio
  editStart: number,      // Posición donde empezó el cambio
  editDeletedLen: number, // Caracteres eliminados
  editInsertedLen: number // Caracteres insertados
}
```

**¿Por qué enviar el texto completo + diff?**
- El texto completo garantiza consistencia: el receptor simplemente reemplaza su contenido
- El diff (`editStart`, `editDeletedLen`, `editInsertedLen`) se usa para **ajustar las posiciones de los cursores remotos** sin necesidad de recalcular desde cero

### `sync-request` — Solicitud de Sincronización

Se envía cuando un peer se une a una sala para obtener el documento actual.

```typescript
{
  type: 'sync-request',
  text: '' // Ignorado por el receptor
}
```

### `sync-response` — Respuesta de Sincronización

El host (o cualquier peer conectado) responde con el documento actual.

```typescript
{
  type: 'sync-response',
  text: string // El contenido completo del documento
}
```

### `cursor` — Posición del Cursor

Se envía cuando el usuario mueve el cursor (con throttle de 50ms).

```typescript
{
  type: 'cursor',
  position: number,  // Posición del cursor en el texto (índice)
  peerId: string,    // ID único del peer
  color: string,     // Color asignado al peer
  name: string       // Nombre del usuario
}
```

### `peer-list` — Lista de Peers

Se envía cuando un nuevo peer se conecta, para que descubra a los demás peers y establezca conexiones mesh.

```typescript
{
  type: 'peer-list',
  peers: string[] // Array de IDs de todos los peers conocidos
}
```

## 3. Flujo de Conexión

### 3.1 Crear una Sala (Host)

```
Usuario A: "Create Room"
    │
    ▼
1. Generar ID aleatorio: "inkwell-xxxxxx"
   (Math.random().toString(36).slice(2, 8))

2. Crear Peer con ese ID:
   peer = new Peer('inkwell-abc123')

3. Guardar documento en localStorage:
   localStorage.setItem('inkwell-doc-inkwell-abc123', content)

4. Escuchar conexiones entrantes:
   peer.on('connection', (conn) => setupConnection(conn))

5. Estado → isConnected: true, roomId: 'inkwell-abc123'
```

### 3.2 Unirse a una Sala (Guest)

```
Usuario B: "Join Room" → introduce "inkwell-abc123"
    │
    ▼
1. Crear Peer con ID auto-generado:
   peer = new Peer()
   // PeerJS asigna un UUID automáticamente

2. Conectar al host:
   conn = peer.connect('inkwell-abc123', { reliable: true })

3. Cuando la conexión se abre:
   conn.on('open', () => {
     // Enviar sync-request para obtener el documento
     conn.send({ type: 'sync-request', text: '' })
   })

4. Recibir sync-response con el documento:
   peer.on('connection', (incomingConn) => {
     // Si el host también se conecta a nosotros (mesh)
     setupConnection(incomingConn, true) // skipSync = true
   })

5. Recibir peer-list y conectar a otros peers:
   // Si ya hay más peers en la sala, el host envía la lista
   // y el nuevo peer conecta con cada uno
```

### 3.3 Formación de la Mesh

El mecanismo de descubrimiento de peers es **recursivo**:

```
1. Peer B se conecta a Peer A (host)

2. Peer A envía a Peer B su peer-list:
   { type: 'peer-list', peers: ['peer-a-id'] }

3. Peer A broadcastea a todos sus peers existentes:
   { type: 'peer-list', peers: ['peer-a-id', 'peer-b-id'] }

4. Peer C (ya conectado a A) recibe la lista, ve que B es nuevo,
   y se conecta a B directamente.

5. Peer B recibe la conexión de C → mesh completa.
```

**Código clave en `handleData`:**

```typescript
if (msg.type === 'peer-list') {
  const peers = msg.peers as string[];
  const myId = myIdRef.current;
  const alreadyConnected = Array.from(connectionsRef.current.keys());

  for (const peerId of peers) {
    if (peerId !== myId && !alreadyConnected.includes(peerId)) {
      const c = p.connect(peerId, { reliable: true });
      setupConnection(c, true); // true = no enviar sync-request
    }
  }
}
```

## 4. Sincronización de Contenido

### 4.1 Cálculo del Diff

La función `computeEdit` calcula qué parte del texto cambió:

```typescript
function computeEdit(oldText: string, newText: string) {
  // 1. Encontrar el primer carácter diferente desde el inicio
  let start = 0;
  while (start < oldText.length && start < newText.length
         && oldText[start] === newText[start]) start++;

  // 2. Encontrar el último carácter diferente desde el final
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start
         && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  return {
    start,
    deletedLen: oldEnd - start,   // Cuántos caracteres se borraron
    insertedLen: newEnd - start   // Cuántos caracteres se insertaron
  };
}
```

**Ejemplo:**
```
oldText: "Hello world"
newText: "Hello beautiful world"

start = 6 (después de "Hello ")
oldEnd = 11 ("world")
newEnd = 21 ("beautiful world")

Resultado: { start: 6, deletedLen: 0, insertedLen: 10 }
```

### 4.2 Ajuste de Cursores

Cuando llega un cambio remoto, los cursores de los otros peers deben ajustarse:

```typescript
function adjustPos(pos: number, start: number, deletedLen: number, insertedLen: number) {
  // Si el cursor está antes del cambio → no se mueve
  if (pos <= start) return pos;

  // Si el cursor está dentro del texto borrado → se mueve al final del insertado
  if (pos <= start + deletedLen) return start + insertedLen;

  // Si el cursor está después del cambio → se desplaza por la diferencia
  return pos + (insertedLen - deletedLen);
}
```

**Ejemplo:**
```
Cursor en posición 15, se insertan 10 caracteres en posición 6:
adjustPos(15, 6, 0, 10) → 15 + (10 - 0) = 25
```

### 4.3 Prevención de Ecos (Loop Prevention)

La variable `isRemoteRef` evita que un cambio recibido se re-broadcastee:

```typescript
const handleData = (connPeerId, data) => {
  if (msg.type === 'change') {
    isRemoteRef.current = true;     // Marcar como cambio remoto
    onRemoteChange(msg.text);       // Actualizar el estado
    requestAnimationFrame(() => {
      isRemoteRef.current = false;  // Desmarcar en el siguiente frame
    });
  }
};

const broadcastChange = (text: string) => {
  if (isRemoteRef.current) return;  // ¡No re-broadcastear cambios remotos!
  // ... enviar a todos los peers
};
```

## 5. Persistencia Local

### localStorage Keys

| Key | Formato | Ejemplo |
|---|---|---|
| Salas guardadas | `inkwell-rooms` | `["inkwell-abc123", "inkwell-def456"]` |
| Documento | `inkwell-doc-{roomId}` | `inkwell-doc-inkwell-abc123` → `"# Hello\n..."` |

### Operaciones

```typescript
// Guardar una sala y su documento
function saveRooms(rooms: string[]) {
  localStorage.setItem('inkwell-rooms', JSON.stringify(rooms));
}

function saveDoc(roomId: string, text: string) {
  localStorage.setItem('inkwell-doc-' + roomId, text);
  // También añade el roomId a la lista si no existe
  const rooms = getSavedRooms();
  if (!rooms.includes(roomId)) { rooms.push(roomId); saveRooms(rooms); }
}

// Cargar documento
function loadDoc(roomId: string): string | null {
  return localStorage.getItem('inkwell-doc-' + roomId);
}

// Eliminar sala y documento
function deleteDoc(roomId: string) {
  localStorage.removeItem('inkwell-doc-' + roomId);
  saveRooms(getSavedRooms().filter(r => r !== roomId));
}
```

### Cuándo se guarda

1. **En cada cambio local**: `broadcastChange` llama a `saveDoc`
2. **En cada cambio remoto**: `handleData` llama a `saveDoc`
3. **Al desconectarse**: `disconnect` llama a `saveDoc`
4. **Al desmontar el hook**: el `useEffect` cleanup llama a `saveDoc`

## 6. Gestión de Conexiones

### Mapa de Conexiones

```typescript
const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
```

La clave es el `peerId` y el valor es la instancia `DataConnection` de PeerJS.

### Setup de una Conexión

```typescript
const setupConnection = (conn: DataConnection, skipSync?: boolean) => {
  // Evitar conexiones duplicadas
  if (connectionsRef.current.has(conn.peer)) return;

  // Registrar la conexión
  connectionsRef.current.set(conn.peer, conn);
  updatePeerCount();

  // Handler de datos entrantes
  conn.on('data', (data) => handleData(conn.peer, data));

  // Cuando se abre la conexión
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
};
```

### Cleanup

Al desmontar el hook o al desconectar manualmente:

```typescript
useEffect(() => {
  return () => {
    if (roomIdRef.current) saveDoc(roomIdRef.current, contentRef.current);
    if (peerRef.current) peerRef.current.destroy();
  };
}, []);
```

## 7. Cursores Remotos

### Asignación de Color

Cada peer recibe un color aleatorio al inicializarse:

```typescript
const CURSOR_COLORS = [
  '#c45d3e', // terracota
  '#2d8a4e', // verde
  '#4a6fa5', // azul
  '#9b59b6', // púrpura
  '#e67e22', // naranja
  '#1abc9c', // turquesa
  '#e74c3c', // rojo
  '#3498db', // azul claro
];

const peerColorRef = useRef<string>(
  CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]
);
```

### Throttle del Cursor

El cursor se broadcastea con un throttle de 50ms para no saturar la red:

```typescript
const handleCursorMove = useCallback((position: number) => {
  if (cursorTimerRef.current) return; // Ignorar si hay un timer activo
  cursorTimerRef.current = setTimeout(() => {
    cursorTimerRef.current = null;
    collabActions.broadcastCursor(position);
  }, 50);
}, [collabActions]);
```

### Cálculo de Posición en Pantalla

`RemoteCursors.tsx` usa un **elemento espejo invisible** para calcular dónde renderizar cada cursor remoto:

1. Crea un `div` invisible con los mismos estilos que el textarea
2. Inserta el texto antes de la posición del cursor
3. Añade un `span` marker con un carácter zero-width (`\u200b`)
4. Lee `offsetTop` y `offsetLeft` del marker
5. Destruye el espejo y renderiza el cursor en esas coordenadas

## 8. Re-hosting

La función `createRoomFromDoc` permite crear una nueva sala con el contenido de un documento guardado:

```typescript
const createRoomFromDoc = useCallback((oldRoomId: string) => {
  const savedContent = loadDoc(oldRoomId) || '';

  // Crear nuevo peer con nuevo ID
  const id = 'inkwell-' + Math.random().toString(36).slice(2, 8);
  const peer = new Peer(id);

  peer.on('open', () => {
    saveDoc(id, savedContent);       // Guardar con nuevo roomId
    onRemoteChange(savedContent);    // Cargar contenido en el editor
    // ...
  });
}, []);
```

Esto es útil para:
- Reabrir una sesión colaborativa con un documento previo
- Crear una nueva sala sin perder el documento original
- "Fork" de documentos para experimentar

## 9. Limitaciones y Consideraciones

### Sin CRDT

Inkwell **no usa CRDTs** (Conflict-free Replicated Data Types). En su lugar, usa un modelo de **último escritor gana**: el último cambio broadcasteado sobrescribe el contenido de todos los peers.

**Implicaciones:**
- Si dos usuarios editan simultáneamente, puede haber pérdida de cambios
- No hay resolución automática de conflictos
- Funciona bien con escritura turnada o baja concurrencia

**Para producción**, se recomendaría integrar **Yjs** o **Automerge** para OT/CRDT.

### Escalabilidad

La topología mesh limita el número práctico de peers a ~10-15. Más allá:
- Demasiadas conexiones WebRTC simultáneas
- Latencia en la propagación de cambios
- Posible congestión de red

### Signaling Server

PeerJS usa por defecto el servidor público `0.peerjs.com`. Para producción:
- Deployar un PeerServer propio
- Configurar STUN/TURN servers para NAT traversal
- Considerar autenticación de peers
