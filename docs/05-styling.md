# Sistema de Estilos y Design Tokens

## global.css

**Ruta:** `src/styles/global.css`

### Filosofía de Diseño

Inkwell usa un sistema de diseño inspirado en **papel y tinta**, con una paleta cálida que evoca un cuaderno físico. Los colores son terrosos y suaves, evitando los blancos puros y los negros absolutos.

## Design Tokens (CSS Custom Properties)

### Colores de Fondo

| Variable | Valor | Uso |
|---|---|---|
| `--bg` | `#f5f0e8` | Fondo principal de la página (beige cálido) |
| `--bg-subtle` | `#ebe5d9` | Fondo secundario (beige más oscuro) |
| `--paper` | `#fefcf7` | Fondo de las "hojas" de papel (blanco cremoso) |
| `--paper-shadow` | `rgba(45, 35, 20, 0.08)` | Sombra sutil de las hojas |
| `--toolbar-bg` | `#faf6ef` | Fondo de la toolbar |
| `--toolbar-hover` | `#f0ebe0` | Fondo hover de botones en toolbar |
| `--code-bg` | `#f0ebe0` | Fondo de bloques de código e IDs |

### Colores de Texto

| Variable | Valor | Uso |
|---|---|---|
| `--ink` | `#2c2417` | Texto principal (marrón muy oscuro, casi negro) |
| `--ink-light` | `#6b5e4d` | Texto secundario (marrón medio) |
| `--ink-muted` | `#9e9183` | Texto terciario (gris cálido) |

### Color de Acento

| Variable | Valor | Uso |
|---|---|---|
| `--accent` | `#c45d3e` | Color principal de acción (terracota/rojo arcilla) |
| `--accent-hover` | `#d4714f` | Hover del acento (terracota más claro) |

### Bordes

| Variable | Valor | Uso |
|---|---|---|
| `--border` | `#d9d0c3` | Bordes estándar |
| `--border-light` | `#e8e1d5` | Bordes sutiles |

### Tipografía

| Variable | Valor | Uso |
|---|---|---|
| `--font-body` | `'Crimson Pro', Georgia, serif` | Cuerpo del texto, editor, preview |
| `--font-ui` | `'DM Sans', -apple-system, sans-serif` | UI elements, botones, labels |

### Radios de Borde

| Variable | Valor | Uso |
|---|---|---|
| `--radius-sm` | `4px` | Botones pequeños, inputs |
| `--radius-md` | `8px` | Hojas de papel, cards |
| `--radius-lg` | `12px` | Contenedores grandes |

### Fuentes Externas

Se cargan desde Google Fonts:

```css
@import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
```

- **Crimson Pro**: serif con pesos 300-700, italic incluido. Elegante y legible para texto largo.
- **DM Sans**: sans-serif con pesos 400-700. Moderna y clara para elementos de UI.

## Estilos Globales

### Reset Básico

```css
*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
```

### HTML

```css
html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

Suavizado de fuentes para mejor renderizado en macOS.

### Body

```css
body {
  font-family: var(--font-body);
  background-color: var(--bg);
  color: var(--ink);
  min-height: 100vh;
  line-height: 1.6;
}
```

### Selección de Texto

```css
::selection {
  background: var(--accent);
  color: white;
}
```

El texto seleccionado usa el color terracota de acento con texto blanco.

### Scrollbar Personalizado

```css
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--ink-muted);
}
```

Scrollbar delgado y sutil que se oscurece al hover.

## Estilos Inline en Componentes

Los componentes React usan **inline styles** con objetos JavaScript en lugar de CSS classes. Esto permite:

1. Usar variables CSS directamente en los valores
2. Calcular estilos dinámicamente
3. Evitar colisiones de nombres

### Patrón Común

```tsx
const styles: Record<string, CSSProperties> = {
  wrapper: {
    display: 'flex',
    justifyContent: 'center',
    flex: 1,
  },
  paper: {
    width: '100%',
    maxWidth: '780px',
    background: 'var(--paper)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 1px 3px var(--paper-shadow), 0 8px 24px var(--paper-shadow)',
    // ...
  },
};
```

### Uso de Variables CSS en Inline Styles

Las variables CSS funcionan en inline styles porque el navegador las resuelve en el renderizado:

```tsx
<div style={{
  background: 'var(--paper)',
  color: 'var(--ink)',
  boxShadow: '0 1px 3px var(--paper-shadow)',
}}>
```

### Hover Effects Inline

Como los inline styles no soportan pseudo-clases directamente, se implementan con event handlers:

```tsx
<button
  onMouseEnter={(e) => {
    e.currentTarget.style.background = 'var(--toolbar-hover)';
    e.currentTarget.style.color = 'var(--ink)';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.background = 'none';
    e.currentTarget.style.color = 'var(--ink-light)';
  }}
>
```

## Layout Visual

```
┌──────────────────────────────────────────────────────┐
│  --bg (#f5f0e8) - Fondo de toda la página            │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  CollabBar - --toolbar-bg                      │ │
│  │  border-bottom: 1px solid --border-light       │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │  Toolbar - --toolbar-bg                        │ │
│  │  border-bottom: 1px solid --border-light       │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────┐  ┌────────────────────┐    │
│  │  Editor            │  │  Preview           │    │
│  │  --paper           │  │  --paper           │    │
│  │  maxWidth: 780px   │  │  maxWidth: 780px   │    │
│  │  box-shadow        │  │  box-shadow        │    │
│  │                    │  │                    │    │
│  │  ┌───┐ ┌───────┐  │  │  Contenido HTML    │    │
│  │  │LN │ │textarea│  │  │  --font-body       │    │
│  │  │   │ │       │  │  │  --ink             │    │
│  │  └───┘ └───────┘  │  │                    │    │
│  │                    │  │                    │    │
│  └────────────────────┘  └────────────────────┘    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## Paleta de Cursores Remotos

Los cursores remotos usan colores distintos del acento principal para diferenciarse:

```typescript
const CURSOR_COLORS = [
  '#c45d3e', // terracota (también es el --accent)
  '#2d8a4e', // verde bosque
  '#4a6fa5', // azul acero
  '#9b59b6', // púrpura
  '#e67e22', // naranja
  '#1abc9c', // turquesa
  '#e74c3c', // rojo
  '#3498db', // azul claro
];
```

Cada peer recibe uno aleatoriamente al conectarse.
