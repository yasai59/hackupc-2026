# Estructura del Proyecto

## Árbol de Directorios

```
v2/
├── .astro/                    # Tipos generados por Astro (auto)
│   ├── content.d.ts
│   ├── settings.json
│   └── types.d.ts
├── .vscode/                   # Configuración de VS Code
│   ├── extensions.json        # Extensiones recomendadas
│   └── launch.json            # Configuración de debug
├── public/                    # Assets estáticos (se copian tal cual al build)
│   ├── favicon.ico
│   └── favicon.svg
├── src/                       # Código fuente
│   ├── components/            # Componentes React
│   │   ├── CollabBar.tsx      # Barra de colaboración (crear/unirse a salas)
│   │   ├── Editor.tsx         # Editor de texto con números de línea
│   │   ├── EditorApp.tsx      # Componente raíz que orquesta todo
│   │   ├── MarkdownPreview.tsx # Vista previa del Markdown renderizado
│   │   ├── RemoteCursors.tsx  # Overlay de cursores remotos
│   │   └── Toolbar.tsx        # Barra de herramientas de formato
│   ├── hooks/
│   │   └── useCollab.ts       # Hook principal de colaboración P2P
│   ├── layouts/
│   │   └── Base.astro         # Layout HTML base con meta tags
│   ├── pages/
│   │   └── index.astro        # Página principal (ruta /)
│   └── styles/
│       └── global.css         # Variables CSS y estilos globales
├── astro.config.mjs           # Configuración de Astro
├── package.json               # Dependencias y scripts
├── tsconfig.json              # Configuración de TypeScript
└── .gitignore                 # Archivos ignorados por git
```

## Descripción de Cada Archivo

### Configuración

#### `astro.config.mjs`
Configuración mínima de Astro. Únicamente habilita la integración de React para poder usar componentes `.tsx` dentro del proyecto.

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()]
});
```

#### `tsconfig.json`
Extiende la configuración estricta de Astro y configura JSX para React 17+ con el pragma automático.

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

#### `package.json`
Define las dependencias del proyecto. Requiere Node.js >= 22.12.0.

**Dependencias clave:**
- `astro` — Framework principal
- `@astrojs/react` — Integración React
- `peerjs` — WebRTC simplificado para P2P
- `marked` — Parser Markdown → HTML
- `react` / `react-dom` — Librería UI
- `typescript` — Tipado estático

### Páginas y Layouts

#### `src/pages/index.astro`
La única página del proyecto. Importa el layout `Base` y el componente React `EditorApp`. La directiva `client:load` hidrata el componente React inmediatamente en el cliente, ya que toda la lógica de edición y colaboración es client-side.

```astro
<Base>
  <EditorApp client:load />
</Base>
```

#### `src/layouts/Base.astro`
Layout HTML base que envuelve todas las páginas. Define:
- Meta charset y viewport
- Favicon SVG
- Título por defecto: "Inkwell — Markdown Editor"
- Importa los estilos globales con `is:global`

### Componentes React

#### `src/components/EditorApp.tsx`
**Componente raíz de la aplicación.** Orquesta todos los demás componentes y gestiona:
- Estado del contenido del documento
- Integración con el hook `useCollab`
- Formateo de texto (bold, italic, headings, etc.)
- Atajos de teclado (Ctrl+B, Ctrl+I, Tab)
- Descarga del archivo `.md`
- Throttle del broadcast de cursor (50ms)

#### `src/components/Editor.tsx`
**El editor de texto principal.** Contiene:
- `textarea` auto-expandible que crece con el contenido
- Números de línea generados dinámicamente
- Continuación automática de listas (ul/ol) al pulsar Enter
- Detección de línea vacía para cerrar listas
- Overlay de `RemoteCursors` superpuesto

#### `src/components/MarkdownPreview.tsx`
**Vista previa del Markdown.** Usa `marked` para parsear el contenido a HTML. El parseo se memoiza con `useMemo` para evitar re-renderizados innecesarios. Usa `dangerouslySetInnerHTML` para renderizar el HTML resultante.

#### `src/components/Toolbar.tsx`
**Barra de herramientas superior.** Contiene:
- Logo "inkwell"
- Botones de formato: H1, H2, H3, Bold, Italic, Strikethrough, Quote, Code, Code Block, HR, UL, OL, Link
- Botón de descarga `.md`
- Contador de palabras y caracteres

#### `src/components/CollabBar.tsx`
**Barra de colaboración.** Gestiona la UI de conexión P2P:
- Input de nombre de usuario
- Estados: desconectado / conectado
- Crear sala, unirse a sala, desconectarse
- Copiar Room ID al portapapeles
- Sección de salas guardadas con dropdown
- Re-hosting de documentos guardados
- Botón de eliminación de salas

#### `src/components/RemoteCursors.tsx`
**Overlay de cursores remotos.** Renderiza barras de color y etiquetas con el nombre de cada peer remoto en la posición correspondiente del texto. Usa un **elemento espejo** (mirror div) invisible para calcular las coordenadas X/Y de cada posición de texto, replicando exactamente los estilos del textarea.

### Hooks

#### `src/hooks/useCollab.ts`
**El corazón de la colaboración P2P.** Este custom hook gestiona:
- Creación y destrucción de instancias PeerJS
- Conexiones mesh entre todos los peers
- Broadcast de cambios de texto con diff
- Sincronización inicial al unirse a una sala
- Gestión de cursores remotos
- Persistencia en localStorage
- Ajuste de posiciones de cursor basado en edits

### Estilos

#### `src/styles/global.css`
Define el sistema de diseño completo mediante **CSS custom properties** (variables CSS):
- Paleta de colores cálida tipo "papel" (beige, marrón, terracota)
- Dos tipografías: Crimson Pro (serif) para cuerpo, DM Sans (sans-serif) para UI
- Variables de espaciado, radios de borde, sombras
- Estilos de scrollbar personalizados
- Selección de texto con color accent
