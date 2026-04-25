# Componentes React

## EditorApp.tsx

**Ruta:** `src/components/EditorApp.tsx`

### Rol

Componente raíz de la aplicación React. Orquesta todos los sub-componentes y gestiona la lógica de formateo de texto, atajos de teclado y descarga.

### Props

No recibe props. Toda la lógica es interna.

### Estado Interno

| Estado | Tipo | Descripción |
|---|---|---|
| `content` | `string` | Contenido actual del documento Markdown |
| `username` | `string` | Nombre del usuario (por defecto: "Writer") |

### Refs

| Ref | Tipo | Descripción |
|---|---|---|
| `textareaRef` | `React.RefObject<HTMLTextAreaElement>` | Referencia al textarea del editor |
| `cursorTimerRef` | `React.RefObject<setTimeout>` | Timer para throttle del broadcast de cursor |

### Integración con useCollab

```tsx
const handleRemoteChange = useCallback((text: string) => {
  setContent(text);
}, []);

const [collabState, collabActions] = useCollab(content, handleRemoteChange, username);
```

- `content` se pasa al hook para que pueda broadcastear cambios
- `handleRemoteChange` es el callback que se ejecuta cuando llega un cambio remoto
- `username` se usa para los cursores remotos

### Funciones de Formateo

#### `wrapSelection`

Envuelve el texto seleccionado con caracteres antes y después:

```tsx
function wrapSelection(text: string, start: number, end: number, before: string, after: string) {
  return text.slice(0, start) + before + text.slice(start, end) + after + text.slice(end);
}
```

**Ejemplo:** `wrapSelection("hello", 1, 4, "**", "**")` → `"h**ell**o"`

#### `insertAtLineStart`

Inserta un prefijo al inicio de la línea donde está el cursor:

```tsx
function insertAtLineStart(text: string, start: number, prefix: string) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  return text.slice(0, lineStart) + prefix + text.slice(lineStart);
}
```

**Ejemplo:** Insertar `"# "` en `"hello\nworld"` con cursor en posición 7 → `"hello\n# world"`

#### `handleFormat`

Gestiona todos los tipos de formato mediante un switch:

| Tipo | Acción | Resultado |
|---|---|---|
| `h1` | Inserta `# ` al inicio de la línea | `# Título` |
| `h2` | Inserta `## ` al inicio de la línea | `## Subtítulo` |
| `h3` | Inserta `### ` al inicio de la línea | `### Sección` |
| `bold` | Envuelve con `**` | `**texto**` |
| `italic` | Envuelve con `*` | `*texto*` |
| `strikethrough` | Envuelve con `~~` | `~~texto~~` |
| `quote` | Inserta `> ` al inicio de la línea | `> cita` |
| `code` | Envuelve con `` ` `` | `` `código` `` |
| `codeblock` | Envuelve con ```` ```\n ```` y ```` \n``` ```` | Bloque de código |
| `hr` | Inserta `\n---\n` | Línea horizontal |
| `ul` | Inserta `- ` al inicio de la línea | `- item` |
| `ol` | Inserta `1. ` al inicio de la línea | `1. item` |
| `link` | Envuelve con `[` y `](url)` | `[texto](url)` |

Después de cada formato, restaura el foco en el textarea y posiciona el cursor correctamente con `requestAnimationFrame`.

### Atajos de Teclado

```tsx
const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'b') { e.preventDefault(); handleFormat('bold'); }
    if (e.key === 'i') { e.preventDefault(); handleFormat('italic'); }
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    // Inserta 2 espacios
  }
}, []);
```

### Descarga

```tsx
const handleDownload = useCallback(() => {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (collabState.roomId || 'document') + '.md';
  a.click();
  URL.revokeObjectURL(url);
}, [content, collabState.roomId]);
```

El nombre del archivo es el Room ID si existe, o "document" por defecto.

### Render

```tsx
<div style={styles.app} onKeyDown={handleKeyDown}>
  <CollabBar ... />
  <Toolbar ... />
  <div style={styles.workspace}>
    <Editor ... />
    <MarkdownPreview ... />
  </div>
</div>
```

Layout vertical: CollabBar arriba, Toolbar debajo, y workspace con Editor y Preview lado a lado.

---

## Editor.tsx

**Ruta:** `src/components/Editor.tsx`

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| `value` | `string` | Contenido actual del textarea |
| `onChange` | `(value: string) => void` | Callback al cambiar el contenido |
| `onCursorMove` | `(position: number) => void` | Callback al mover el cursor |
| `textareaRef` | `React.RefObject<HTMLTextAreaElement>` | Ref al textarea |
| `remoteCursors` | `RemoteCursor[]` | Lista de cursores remotos |

### Auto-expand del Textarea

```tsx
const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
  const el = e.target;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
  onChange(el.value);
  onCursorMove(el.selectionStart);
}, []);
```

El truco: resetear height a `auto` y luego establecer a `scrollHeight` hace que el textarea crezca exactamente al tamaño del contenido.

### Continuación Automática de Listas

Al pulsar Enter dentro de una lista, se continúa automáticamente:

```tsx
const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key !== 'Enter') return;

  // Detectar lista desordenada: "- " o "* " o "+ "
  const ulMatch = stripped.match(/^(\s*)([-*+])\s/);
  // Detectar lista ordenada: "1. " o "2. " etc.
  const olMatch = stripped.match(/^(\s*)(\d+)\.\s/);

  // Si la línea está vacía (solo el prefijo), cerrar la lista
  if (stripped === ulMatch[1] + ulMatch[2] + ' ') {
    // Eliminar la línea vacía y no añadir prefijo
  }

  // Si hay contenido, continuar la lista
  if (ulMatch) prefix = ulMatch[1] + ulMatch[2] + ' ';
  if (olMatch) prefix = olMatch[1] + (num + 1) + '. '; // Incrementar número
});
```

**Ejemplos:**
```
- Item 1\n|    →    - Item 1\n- |
1. Primero\n|  →    1. Primero\n2. |
- \n|        →    \n|  (cierra la lista)
```

### Números de Línea

Se generan dinámicamente splitteando el contenido por `\n`:

```tsx
const lines = value.split('\n');
// ...
{lines.map((_line, i) => (
  <div key={i} style={styles.lineNumber}>{i + 1}</div>
))}
```

Los números de línea están posicionados absolutamente a la izquierda del textarea con `opacity: 0.5`.

### RemoteCursors Overlay

Dentro del contenedor del textarea, se renderiza `RemoteCursors` que posiciona barras de color sobre el texto:

```tsx
<div style={styles.textAreaContainer}>
  <textarea ... />
  <RemoteCursors cursors={remoteCursors} text={value} textareaRef={textareaRef} />
</div>
```

---

## MarkdownPreview.tsx

**Ruta:** `src/components/MarkdownPreview.tsx`

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| `markdown` | `string` | Contenido Markdown a renderizar |

### Parseo con Marked

```tsx
marked.setOptions({
  gfm: true,    // GitHub Flavored Markdown (tablas, strikethrough, etc.)
  breaks: true, // \n se convierte en <br>
});
```

El parseo se memoiza para evitar re-evaluar en cada render:

```tsx
const html = useMemo(() => {
  if (!markdown.trim()) return '<p style="...">Preview will appear here...</p>';
  return marked.parse(markdown) as string;
}, [markdown]);
```

### Renderizado

```tsx
<div
  style={styles.content}
  dangerouslySetInnerHTML={{ __html: html }}
/>
```

Se usa `dangerouslySetInnerHTML` porque el output de `marked.parse()` es HTML string.

---

## Toolbar.tsx

**Ruta:** `src/components/Toolbar.tsx`

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| `onFormat` | `(type: string) => void` | Callback al pulsar un botón de formato |
| `wordCount` | `number` | Número de palabras |
| `charCount` | `number` | Número de caracteres |
| `onDownload` | `() => void` | Callback al pulsar descargar |

### Botones

Los botones se definen como un array de objetos `ToolbarButton`:

```tsx
const buttons: ToolbarButton[] = [
  { label: 'H1', action: () => onFormat('h1'), style: { fontWeight: 700, fontSize: '15px' } },
  { label: 'H2', action: () => onFormat('h2'), style: { fontWeight: 600, fontSize: '13px' } },
  // ... etc
];
```

Cada botón tiene:
- `label`: texto visible
- `action`: función a ejecutar
- `title`: tooltip
- `style`: estilos opcionales (para diferenciar visualmente H1/H2/H3/B/I/S)

### Hover Effects

Se implementan inline con `onMouseEnter`/`onMouseLeave`:

```tsx
onMouseEnter={(e) => {
  e.currentTarget.style.background = 'var(--toolbar-hover)';
  e.currentTarget.style.color = 'var(--ink)';
}}
onMouseLeave={(e) => {
  e.currentTarget.style.background = 'none';
  e.currentTarget.style.color = 'var(--ink-light)';
}}
```

---

## CollabBar.tsx

**Ruta:** `src/components/CollabBar.tsx`

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| `state` | `CollabState` | Estado de la conexión |
| `username` | `string` | Nombre actual del usuario |
| `onUsernameChange` | `(name: string) => void` | Cambiar nombre |
| `onCreateRoom` | `() => void` | Crear nueva sala |
| `onJoinRoom` | `(id: string) => void` | Unirse a sala |
| `onDisconnect` | `() => void` | Desconectarse |
| `onDeleteRoom` | `(id: string) => void` | Eliminar sala guardada |
| `onLoadRoom` | `(id: string) => string \| null` | Cargar documento de sala |
| `onRehostRoom` | `(id: string) => void` | Re-hostear sala guardada |

### CollabState Interface

```typescript
interface CollabState {
  isConnected: boolean;   // ¿Conectado a una sala?
  roomId: string | null;  // ID de la sala actual
  peerCount: number;      // Número de peers conectados
  error: string | null;   // Último error
  savedRooms: string[];   // Lista de salas guardadas
}
```

### Estado Interno

| Estado | Tipo | Descripción |
|---|---|---|
| `joinId` | `string` | ID introducido en el formulario de join |
| `showJoin` | `boolean` | ¿Mostrar formulario de join? |
| `copied` | `boolean` | ¿Se copió el ID al portapapeles? |
| `showRooms` | `boolean` | ¿Mostrar dropdown de salas guardadas? |

### Dos Modos de Render

**Modo conectado** (`isConnected && roomId`):
- Input de nombre
- Indicador "📡 Connected"
- Room ID en formato código
- Botón "Copy ID" (con feedback visual "ID Copied!")
- Contador de peers
- Botón "Leave"

**Modo desconectado**:
- Input de nombre
- Botón "Create Room"
- Botón "Join Room" (que se transforma en formulario con input + Connect + Cancel)
- Sección de salas guardadas (si existen)
- Mensaje de error (si hay)

### Salas Guardadas

El dropdown muestra cada sala con:
- Room ID en monospace
- Preview de las primeras 40 caracteres del documento
- Botón para unirse directamente
- Botón "Re-host" para crear nueva sala con ese contenido
- Botón de eliminación

---

## RemoteCursors.tsx

**Ruta:** `src/components/RemoteCursors.tsx`

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| `cursors` | `RemoteCursor[]` | Lista de cursores remotos |
| `text` | `string` | Contenido actual del textarea |
| `textareaRef` | `React.RefObject<HTMLTextAreaElement>` | Ref al textarea |

### RemoteCursor Interface

```typescript
interface RemoteCursor {
  peerId: string;    // ID único del peer
  position: number;  // Posición en el texto
  color: string;     // Color del cursor
  name: string;      // Nombre del usuario
}
```

### Algoritmo de Cálculo de Posición

La función `getCursorCoords` crea un **elemento espejo invisible** que replica exactamente los estilos del textarea:

```tsx
function getCursorCoords(position: number, text: string, textarea: HTMLTextAreaElement, container: HTMLElement) {
  const before = text.slice(0, position);

  // Crear espejo
  const mirror = document.createElement('div');
  const cs = getComputedStyle(textarea);

  // Copiar todos los estilos relevantes
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.wordBreak = 'break-word';
  mirror.style.width = cs.width;
  mirror.style.padding = cs.padding;
  mirror.style.fontFamily = cs.fontFamily;
  mirror.style.fontSize = cs.fontSize;
  mirror.style.lineHeight = cs.lineHeight;
  // ... más estilos

  // Insertar texto + marker
  const textNode = document.createTextNode(before);
  mirror.appendChild(textNode);
  const marker = document.createElement('span');
  marker.textContent = '\u200b'; // zero-width space
  mirror.appendChild(marker);

  container.appendChild(mirror);
  const top = marker.offsetTop;
  const left = marker.offsetLeft;
  container.removeChild(mirror);

  return { top, left };
}
```

### Render

Cada cursor se renderiza como:
- Una barra vertical de 2px de ancho y ~30px de alto (altura de línea)
- Una etiqueta (flag) con el nombre del usuario y los últimos 4 caracteres del peerId
- Transición suave de 80ms para movimiento fluido

```tsx
<div style={{
  ...styles.cursorBar,
  top: pos.top,
  left: pos.left,
  background: cursor.color,
}}>
  <div style={{ ...styles.cursorFlag, background: cursor.color }}>
    {cursor.name} ({cursor.peerId.slice(-4)})
  </div>
</div>
```
