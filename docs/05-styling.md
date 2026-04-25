# Sistema de Estilos y Design Tokens

## global.css

**Ruta:** `src/styles/global.css`

### Filosofía de Diseño

Inkwell usa un sistema de diseño inspirado en **papel y tinta**, con una paleta cálida que evoca un cuaderno físico. Los estilos se implementan con **TailwindCSS v4** usando `@theme` para design tokens y `@tailwindcss/typography` para estilos de markdown.

## Design Tokens (TailwindCSS @theme)

### Colores de Fondo

| Token | Valor | Uso |
|---|---|---|
| `--color-bg` | `#f5f0e8` | Fondo principal (beige cálido) |
| `--color-bg-subtle` | `#ebe5d9` | Fondo secundario |
| `--color-paper` | `#fefcf7` | Fondo de "hojas" (blanco cremoso) |
| `--color-paper-shadow` | `rgba(45, 35, 20, 0.08)` | Sombra de hojas |
| `--color-toolbar-bg` | `#faf6ef` | Fondo de toolbar |
| `--color-toolbar-hover` | `#f0ebe0` | Hover de botones |
| `--color-code-bg` | `#f0ebe0` | Fondo de código e IDs |

### Colores de Texto

| Token | Valor | Uso |
|---|---|---|
| `--color-ink` | `#2c2417` | Texto principal (marrón oscuro) |
| `--color-ink-light` | `#6b5e4d` | Texto secundario |
| `--color-ink-muted` | `#9e9183` | Texto terciario |

### Color de Acento

| Token | Valor | Uso |
|---|---|---|
| `--color-accent` | `#c45d3e` | Color principal (terracota) |
| `--color-accent-hover` | `#d4714f` | Hover del acento |

### Bordes

| Token | Valor | Uso |
|---|---|---|
| `--color-border` | `#d9d0c3` | Bordes estándar |
| `--color-border-light` | `#e8e1d5` | Bordes sutiles |

### Tipografía

| Token | Valor | Uso |
|---|---|---|
| `--font-body` | `'Crimson Pro', Georgia, serif` | Cuerpo del texto |
| `--font-ui` | `'DM Sans', -apple-system, sans-serif` | UI elements |

### Radios de Borde

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | `4px` | Botones pequeños |
| `--radius-md` | `8px` | Hojas de papel |
| `--radius-lg` | `12px` | Contenedores grandes |

## TailwindCSS v4 Configuración

### `global.css`

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@theme {
  --color-bg: #f5f0e8;
  --color-paper: #fefcf7;
  --color-ink: #2c2417;
  --color-accent: #c45d3e;
  /* ... más tokens */
  --font-body: 'Crimson Pro', Georgia, serif;
  --font-ui: 'DM Sans', -apple-system, sans-serif;
}
```

### `astro.config.mjs`

```js
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()]
  }
});
```

## Estilos de Markdown (Prose)

La vista previa usa `@tailwindcss/typography` con estilos customizados bajo `@layer base`:

### Títulos

```css
.prose h1 { font-size: 2em; font-weight: 700; line-height: 1.3; }
.prose h2 { font-size: 1.5em; font-weight: 600; line-height: 1.35; }
.prose h3 { font-size: 1.25em; font-weight: 600; line-height: 1.4; }
```

### Listas

```css
.prose ul { list-style-type: disc; padding-left: 1.5em; }
.prose ol { list-style-type: decimal; padding-left: 1.5em; }
.prose li::marker { color: var(--color-accent); }
```

### Blockquotes

```css
.prose blockquote {
  border-left: 3px solid var(--color-accent);
  background: var(--color-bg-subtle);
  padding: 0.75em 1em;
  border-radius: 0 6px 6px 0;
  font-style: italic;
}
```

### Código

```css
.prose code {
  font-family: 'SF Mono', 'Fira Code', monospace;
  background: var(--color-code-bg);
  color: var(--color-accent);
  padding: 0.15em 0.35em;
  border-radius: 3px;
}

.prose pre {
  background: var(--color-ink);
  color: #e8e1d5;
  border-radius: 8px;
  padding: 1em;
}
```

### Tablas

```css
.prose th {
  background: var(--color-code-bg);
  font-family: var(--font-ui);
  font-weight: 600;
}
```

## Uso en Componentes

### Patrón con Tailwind

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

### Hover Effects

Tailwind maneja hovers directamente con clases:

```tsx
<button className="hover:bg-toolbar-hover hover:text-ink transition-all duration-150">
  Click
</button>
```

### Valores Arbitrarios

Para medidas exactas que no están en el scale de Tailwind:

```tsx
<div className="max-w-[780px] text-[17px] leading-[1.75] h-[29.75px]">
```

## Paleta de Cursores Remotos

```typescript
const CURSOR_COLORS = [
  '#c45d3e', // terracota
  '#2d8a4e', // verde bosque
  '#4a6fa5', // azul acero
  '#9b59b6', // púrpura
  '#e67e22', // naranja
  '#1abc9c', // turquesa
  '#e74c3c', // rojo
  '#3498db', // azul claro
];
```
