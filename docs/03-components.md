# Componentes React

## EditorApp.tsx

**Ruta:** `src/components/EditorApp.tsx`

### Rol

Componente raíz. Orquesta todos los sub-componentes y gestiona formateo de texto, atajos de teclado y descarga.

### Estado y Refs

| Estado/Ref | Tipo | Descripción |
|---|---|---|
| `content` | `string` | Contenido del documento |
| `username` | `string` | Nombre del usuario |
| `textareaRef` | `RefObject<HTMLTextAreaElement>` | Ref al textarea |
| `cursorTimerRef` | `RefObject<setTimeout>` | Timer para throttle del cursor |

### Integración con useCollab

```tsx
const [collabState, collabActions] = useCollab(content, handleRemoteChange, username);
```

### Funciones de Formateo

| Tipo | Acción | Resultado |
|---|---|---|
| `h1`/`h2`/`h3` | Inserta `# ` al inicio de la línea | `# Título` |
| `bold` | Envuelve con `**` | `**texto**` |
| `italic` | Envuelve con `*` | `*texto*` |
| `strikethrough` | Envuelve con `~~` | `~~texto~~` |
| `code` | Envuelve con `` ` `` | `` `código` `` |
| `codeblock` | Envuelve con ```` ``` ```` | Bloque de código |
| `quote` | Inserta `> ` al inicio | `> cita` |
| `ul`/`ol` | Inserta `- ` / `1. ` | `- item` |
| `link` | Envuelve con `[` y `](url)` | `[texto](url)` |

### Atajos de Teclado

- `Ctrl+B` → Bold
- `Ctrl+I` → Italic
- `Tab` → Indentación (2 espacios)

### Layout (Tailwind)

```tsx
<div className="flex flex-col min-h-screen">
  <CollabBar ... />
  <Toolbar ... />
  <div className="flex flex-row items-start">
    <Editor ... />
    <MarkdownPreview ... />
  </div>
</div>
```

---

## Editor.tsx

**Ruta:** `src/components/Editor.tsx`

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| `value` | `string` | Contenido del textarea |
| `onChange` | `(value: string) => void` | Callback al cambiar |
| `onCursorMove` | `(position: number) => void` | Callback al mover cursor |
| `textareaRef` | `RefObject<HTMLTextAreaElement>` | Ref al textarea |
| `remoteCursors` | `RemoteCursor[]` | Cursores remotos |

### Características

- **Auto-expand**: `el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'`
- **Números de línea**: generados con `value.split('\n').map((_, i) => i + 1)`
- **Continuación de listas**: al pulsar Enter en `- item` o `1. item`, continúa automáticamente
- **Cierre de listas**: línea vacía con solo el prefijo cierra la lista

### Layout (Tailwind)

```tsx
<div className="flex justify-center flex-1">
  <div className="relative w-full max-w-[780px] bg-paper rounded-md shadow-[...] border border-border-light p-12 pr-16 pl-20 mx-6 mb-12 mt-8">
    {/* Números de línea */}
    <div className="absolute left-4 top-12 w-11 text-right font-ui text-[11px] text-ink-muted opacity-50">
      {lines.map((_, i) => <div key={i} className="h-[29.75px]">{i + 1}</div>)}
    </div>
    {/* Textarea + cursores remotos */}
    <div className="relative">
      <textarea className="w-full border-none outline-none resize-none font-body text-[17px] leading-[1.75] text-ink bg-transparent caret-accent min-h-[80vh]" />
      <RemoteCursors ... />
    </div>
  </div>
</div>
```

---

## MarkdownPreview.tsx

**Ruta:** `src/components/MarkdownPreview.tsx`

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| `markdown` | `string` | Contenido Markdown |

### Parseo

```tsx
marked.setOptions({ gfm: true, breaks: true });
const html = useMemo(() => marked.parse(markdown), [markdown]);
```

### Layout

```tsx
<div className="flex justify-center p-8 px-6 pb-12 flex-1">
  <div className="w-full max-w-[780px] bg-paper rounded-md shadow-[...] border border-border-light p-12">
    <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
  </div>
</div>
```

La clase `prose` activa los estilos de `@tailwindcss/typography` customizados en `global.css`.

---

## Toolbar.tsx

**Ruta:** `src/components/Toolbar.tsx`

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| `onFormat` | `(type: string) => void` | Callback de formato |
| `wordCount` | `number` | Palabras |
| `charCount` | `number` | Caracteres |
| `onDownload` | `() => void` | Callback de descarga |

### Layout

```tsx
<div className="flex items-center justify-between px-4 py-2 bg-toolbar-bg border-b border-border-light sticky top-0 z-10 backdrop-blur-sm">
  <div className="flex items-center gap-0.5">
    <span className="font-ui text-[15px] font-bold text-accent tracking-tight mr-1">inkwell</span>
    {/* Botones de formato */}
  </div>
  <div className="flex items-center">
    <button className="... bg-accent text-white ...">↓ .md</button>
    <span className="... text-ink-muted">{wordCount} words · {charCount} chars</span>
  </div>
</div>
```

---

## CollabBar.tsx

**Ruta:** `src/components/CollabBar.tsx`

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| `state` | `CollabState` | Estado de conexión |
| `username` | `string` | Nombre actual |
| `onUsernameChange` | `(name: string) => void` | Cambiar nombre |
| `onCreateRoom` | `() => void` | Crear sala |
| `onJoinRoom` | `(id: string) => void` | Unirse a sala |
| `onDisconnect` | `() => void` | Desconectar |
| `onDeleteRoom` | `(id: string) => void` | Eliminar sala |
| `onLoadRoom` | `(id: string) => string \| null` | Cargar documento |
| `onRehostRoom` | `(id: string) => void` | Re-hostear sala |

### Dos Modos de Render

**Conectado:**
- Input de nombre + "📡 Connected" + Room ID + "Copy ID" + peer count + "Leave"

**Desconectado:**
- Input de nombre + "Create Room" + "Join Room" (→ formulario) + salas guardadas

### Salas Guardadas

Dropdown con preview de 40 caracteres del documento, botón de join, re-host y delete.

---

## RemoteCursors.tsx

**Ruta:** `src/components/RemoteCursors.tsx`

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| `cursors` | `RemoteCursor[]` | Lista de cursores remotos |
| `text` | `string` | Contenido del textarea |
| `textareaRef` | `RefObject<HTMLTextAreaElement>` | Ref al textarea |

### Algoritmo de Posición

Usa un **elemento espejo invisible** que replica los estilos del textarea:

1. Crea `div` invisible con mismos estilos (font, padding, width, etc.)
2. Inserta texto antes de la posición del cursor
3. Añade `span` con `\u200b` (zero-width space)
4. Lee `offsetTop` y `offsetLeft` del span
5. Destruye el espejo y renderiza el cursor

### Layout

```tsx
<div ref={wrapperRef} className="absolute inset-0 pointer-events-none z-5 overflow-hidden">
  {cursors.map(cursor => (
    <div
      style={{ top, left, background: cursor.color }}
      className="absolute w-[2px] h-[29.75px] rounded-sm transition-[top,left] duration-[80ms] ease-out opacity-85"
    >
      <div style={{ background: cursor.color }} className="absolute -top-[18px] -left-[1px] text-[10px] font-ui font-semibold text-white px-1 py-0.5 rounded-[3px_3px_3px_0] whitespace-nowrap">
        {cursor.name} ({cursor.peerId.slice(-4)})
      </div>
    </div>
  ))}
</div>
```
