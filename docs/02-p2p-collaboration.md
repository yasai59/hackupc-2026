# Arquitectura P2P — Colaboración en Tiempo Real

Este documento explica en profundidad cómo funciona la colaboración peer-to-peer en Inkwell, implementada con **Hyperswarm** (DHT descentralizada) a través de un **sidecar Node.js** auto-iniciado por Tauri.

## 0. Cero Dependencia de Servidores Externos

| Componente | ¿Servidor externo? | ¿Qué pasa si se cae? |
|---|---|---|
| **Hyperswarm DHT** | No — red descentralizada de peers | La red se auto-repara, sigue funcionando |
| **WebSocket frontend↔sidecar** | No — `localhost:9876`, comunicación local | Solo se pierde conexión con tu propio sidecar |
| **Data streams entre peers** | No — conexión directa peer-to-peer | Si un peer se desconecta, los demás siguen |

**Ningún dato pasa por un servidor central.** El descubrimiento, signaling y transferencia de datos son 100% descentralizados.

## 1. Conceptos Fundamentales

### ¿Qué es Hyperswarm?

Hyperswarm es una librería P2P que proporciona:
- **DHT (Distributed Hash Table)**: red descentralizada para descubrir peers por un topic
- **Conexión directa**: una vez descubiertos, los peers se conectan directamente (sin intermediarios)
- **Encriptación Noise**: todas las conexiones están encriptadas con el protocolo Noise
- **NAT traversal**: funciona detrás de routers y firewalls automáticamente

### ¿Por qué un Sidecar?

El frontend (WebView dentro de Tauri) no tiene acceso directo a sockets raw de red. La solución:

```
Frontend (React/WebView)  →  WebSocket (localhost)  →  Sidecar (Node.js)  →  Hyperswarm DHT  →  Peer remoto
```

El sidecar es un proceso Node.js que:
1. Se auto-inicia cuando Tauri lanza la app
2. Escucha en `ws://localhost:9876`
3. Traduce mensajes WebSocket ↔ streams Hyperswarm
4. Se mata automáticamente al cerrar la app

### Topología de Red: Mesh

Cada peer se conecta directamente a **todos** los demás peers en la misma sala:

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
- Zero servidores externos

**Desventajas:**
- O(N²) conexiones: con N peers hay N*(N-1)/2 conexiones
- No escala bien más de ~10-15 peers

## 2. Flujo de Datos Completo

```
┌──────────────────────────────────────────────────────────────┐
│                        Tu App (Tauri)                         │
│                                                               │
│  ┌─────────────┐      ┌─────────────┐      ┌──────────────┐ │
│  │  Frontend   │─────▶│   Sidecar   │─────▶│  Hyperswarm  │ │
│  │  (React)    │◀─────│  (Node.js)  │◀─────│     DHT      │ │
│  │             │ WS   │             │ P2P  │              │ │
│  │ useCollab   │ msg  │  index.mjs  │ msg  │  swarm.join  │ │
│  └─────────────┘      └─────────────┘      └──────┬───────┘ │
└────────────────────────────────────────────────────┼─────────┘
                                                     │
                                            Internet │
                                                     │
┌────────────────────────────────────────────────────┼─────────┐
│              Otra App (Tauri)                       │         │
│                                                     │         │
│  ┌─────────────┐      ┌─────────────┐      ┌──────▼───────┐ │
│  │  Frontend   │      │   Sidecar   │      │  Hyperswarm  │ │
│  │  (React)    │◀─────│  (Node.js)  │◀─────│     DHT      │ │
│  │             │ WS   │             │ P2P  │              │ │
│  │ useCollab   │ msg  │  index.mjs  │ msg  │  swarm.join  │ │
│  └─────────────┘      └─────────────┘      └──────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## 3. Tipos de Mensajes

### Frontend ↔ Sidecar (WebSocket)

| Tipo | Dirección | Descripción |
|---|---|---|
| `create` | F→S | Crear nueva sala con contenido inicial |
| `join` | F→S | Unirse a sala existente por ID |
| `leave` | F→S | Salir de la sala actual |
| `change` | F→S | Enviar cambio de texto al sidecar |
| `cursor` | F→S | Enviar posición del cursor |
| `username` | F→S | Actualizar nombre de usuario |
| `connected` | S→F | Confirmación de conexión WebSocket |
| `room-created` | S→F | Sala creada exitosamente |
| `room-joined` | S→F | Unión a sala exitosa |
| `room-restored` | S→F | Sala restaurada tras reconexión |
| `left` | S→F | Confirmación de salida de sala |
| `peer-connected` | S→F | Nuevo peer conectado a la sala |
| `peer-disconnected` | S→F | Peer desconectado de la sala |
| `remote-change` | S→F | Cambio de texto recibido de otro peer |
| `remote-cursor` | S→F | Cursor remoto recibido de otro peer |

### Sidecar ↔ Peers Remotos (Hyperswarm Stream)

| Tipo | Descripción |
|---|---|
| `change` | Cambio de texto con diff para ajustar cursores |
| `cursor` | Posición del cursor remoto |
| `sync-response` | Documento completo enviado al nuevo peer |

### Mensaje `change`

```json
{
  "type": "change",
  "text": "contenido completo del documento",
  "editStart": 6,
  "editDeletedLen": 0,
  "editInsertedLen": 10,
  "peerId": "abc123"
}
```

**¿Por qué enviar texto completo + diff?**
- El texto completo garantiza consistencia: el receptor simplemente reemplaza su contenido
- El diff se usa para **ajustar las posiciones de los cursores remotos** sin recalcular desde cero

### Mensaje `cursor`

```json
{
  "type": "cursor",
  "position": 42,
  "peerId": "abc123",
  "color": "#c45d3e",
  "name": "Writer"
}
```

## 4. Flujo de Conexión

### 4.1 Crear una Sala (Host)

```
Usuario A: "Create Room"
    │
    ▼
1. Frontend envía: { type: 'create', content: '...' }
2. Sidecar genera ID: "inkwell-xxxxxx"
3. Sidecar calcula topic: SHA-256(roomId)
4. Sidecar se une a la DHT: swarm.join(topicBuffer)
5. Sidecar responde: { type: 'room-created', roomId, content }
6. Frontend actualiza estado: isConnected=true, roomId
```

### 4.2 Unirse a una Sala (Guest)

```
Usuario B: "Join Room" → introduce "inkwell-xxxxxx"
    │
    ▼
1. Frontend envía: { type: 'join', roomId: 'inkwell-xxxxxx', content }
2. Sidecar calcula el mismo topic: SHA-256(roomId)
3. Sidecar se une a la DHT: swarm.join(topicBuffer)
4. Hyperswarm descubre al host en la DHT
5. Se establece conexión directa P2P
6. El host envía sync-response con el documento
7. Sidecar reenvía al frontend: { type: 'remote-change', text }
8. Frontend actualiza estado: isConnected=true, roomId
```

### 4.3 Descubrimiento de Peers

Hyperswarm usa una **DHT (Distributed Hash Table)** para el descubrimiento:

```
1. Peer A crea sala con roomId "inkwell-abc123"
2. Peer A calcula: topic = SHA-256("inkwell-abc123")
3. Peer A anuncia en la DHT: "estoy disponible en topic X"
4. Peer B quiere unirse a "inkwell-abc123"
5. Peer B calcula el mismo topic = SHA-256("inkwell-abc123")
6. Peer B consulta la DHT: "¿quién está en topic X?"
7. La DHT responde: "Peer A está disponible"
8. Peer B conecta directamente a Peer A (conexión P2P directa)
```

**Importante:** La DHT solo se usa para **descubrimiento**. Una vez conectados, los datos van directamente de peer a peer.

## 5. Sincronización de Contenido

### 5.1 Cálculo del Diff

La función `computeEdit` calcula qué parte del texto cambió:

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

  return {
    start,
    deletedLen: oldEnd - start,
    insertedLen: newEnd - start
  };
}
```

### 5.2 Ajuste de Cursores

```typescript
function adjustPos(pos, start, deletedLen, insertedLen) {
  if (pos <= start) return pos;                        // Antes del cambio
  if (pos <= start + deletedLen) return start + insertedLen; // Dentro del borrado
  return pos + (insertedLen - deletedLen);             // Después del cambio
}
```

### 5.3 Prevención de Ecos (Loop Prevention)

La variable `isRemoteRef` evita que un cambio recibido se re-broadcastee:

```typescript
if (msg.type === 'remote-change') {
  isRemoteRef.current = true;
  onRemoteChange(msg.text);
  requestAnimationFrame(() => { isRemoteRef.current = false; });
}

const broadcastChange = (text) => {
  if (isRemoteRef.current) return;  // ¡No re-broadcastear!
  // ...
};
```

## 6. Persistencia Local

### localStorage Keys

| Key | Formato | Ejemplo |
|---|---|---|
| Salas guardadas | `inkwell-rooms` | `["inkwell-abc123", "inkwell-def456"]` |
| Documento | `inkwell-doc-{roomId}` | `inkwell-doc-inkwell-abc123` → `"# Hello\n..."` |

### Cuándo se guarda

1. **En cada cambio local**: `broadcastChange` llama a `saveDoc`
2. **En cada cambio remoto**: `handleSidecarMessage` llama a `saveDoc`
3. **Al desconectarse**: `disconnect` llama a `saveDoc`
4. **Al crear sala**: `createRoom` guarda el documento

## 7. Gestión del Sidecar (Rust)

### Auto-Start

```rust
fn start_sidecar(app: &tauri::AppHandle) -> Result<(), String> {
    let node_path = which::which("node")?;
    let resource_dir = app.path().resource_dir()?;
    let sidecar_path = resource_dir.join("resources/sidecar/index.mjs");

    let child = Command::new(node_path)
        .arg(&sidecar_path)
        .current_dir(sidecar_path.parent().unwrap())
        .spawn()?;

    *SIDECAR.lock().unwrap() = Some(child);
    Ok(())
}
```

### Auto-Stop

```rust
.on_window_event(|window, event| {
    if let tauri::WindowEvent::Destroyed = event {
        if window.label() == "main" {
            stop_sidecar();
        }
    }
})
```

### Reconexión del Frontend

Si el WebSocket se desconecta, el hook `useCollab` reconecta automáticamente cada 2 segundos. Si hay una sala activa en el sidecar, este envía `room-restored` con el contenido actual.

## 8. Cursores Remotos

### Asignación de Color

```typescript
const CURSOR_COLORS = [
  '#c45d3e', '#2d8a4e', '#4a6fa5', '#9b59b6',
  '#e67e22', '#1abc9c', '#e74c3c', '#3498db',
];
```

### Throttle del Cursor

50ms de throttle para no saturar la red.

### Cálculo de Posición

`RemoteCursors.tsx` usa un **elemento espejo invisible** que replica los estilos del textarea para calcular coordenadas X/Y exactas de cada posición de texto.

## 9. Limitaciones y Consideraciones

### Sin CRDT

Inkwell **no usa CRDTs**. Usa un modelo de **último escritor gana**. Si dos usuarios editan simultáneamente, puede haber pérdida de cambios. Para producción, se recomendaría integrar **Yjs** o **Automerge**.

### Dependencia de Node.js

El sidecar requiere Node.js instalado en el sistema. Tauri lo busca en el PATH con la crate `which`. Para distribución sin dependencias, se podría empaquetar un runtime de Node.js dentro del bundle.

### Escalabilidad

La topología mesh limita el número práctico de peers a ~10-15.
