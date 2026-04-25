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
├── docs/                      # Documentación del proyecto
│   ├── 00-overview.md         # Descripción general y arquitectura
│   ├── 01-project-structure.md# Este archivo
│   ├── 02-p2p-collaboration.md# Arquitectura P2P con Hyperswarm
│   ├── 03-components.md       # Componentes React
│   ├── 04-useCollab-hook.md   # Hook useCollab
│   └── 05-styling.md          # Sistema de estilos TailwindCSS
├── public/                    # Assets estáticos (se copian tal cual al build)
│   ├── favicon.ico
│   └── favicon.svg
├── sidecar/                   # Sidecar Node.js P2P (desarrollo)
│   ├── index.mjs              # Servidor Hyperswarm + WebSocket
│   └── package.json           # Deps: hyperswarm, ws
├── src/                       # Código fuente del frontend
│   ├── components/            # Componentes React
│   │   ├── CollabBar.tsx      # Barra de colaboración (crear/unirse a salas)
│   │   ├── Editor.tsx         # Editor de texto con números de línea
│   │   ├── EditorApp.tsx      # Componente raíz que orquesta todo
│   │   ├── MarkdownPreview.tsx # Vista previa del Markdown renderizado
│   │   ├── RemoteCursors.tsx  # Overlay de cursores remotos
│   │   └── Toolbar.tsx        # Barra de herramientas de formato
│   ├── hooks/
│   │   └── useCollab.ts       # Hook principal de colaboración P2P (WebSocket)
│   ├── layouts/
│   │   └── Base.astro         # Layout HTML base con meta tags
│   ├── pages/
│   │   └── index.astro        # Página principal (ruta /)
│   └── styles/
│       └── global.css         # TailwindCSS + design tokens + prose styles
├── src-tauri/                 # App de escritorio Tauri
│   ├── Cargo.toml             # Deps Rust (tauri, which)
│   ├── capabilities/
│   │   └── default.json       # Permisos de la app
│   ├── icons/                 # Iconos de la app
│   ├── resources/             # Recursos empaquetados
│   │   └── sidecar/           # Copia del sidecar para producción
│   ├── src/
│   │   ├── lib.rs             # Backend Rust: auto-start/stop del sidecar
│   │   └── main.rs            # Entry point de la app
│   ├── target/                # Output de compilación Rust
│   └── tauri.conf.json        # Configuración de Tauri
├── astro.config.mjs           # Configuración de Astro + TailwindCSS
├── package.json               # Dependencias y scripts
├── tsconfig.json              # Configuración de TypeScript
└── .gitignore                 # Archivos ignorados por git
```

## Descripción de Cada Archivo

### Configuración del Frontend

#### `astro.config.mjs`
Configuración de Astro con integración de React y plugin de TailwindCSS vía Vite.

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()]
  }
});
```

#### `tsconfig.json`
Extiende la configuración estricta de Astro y configura JSX para React 17+.

#### `package.json`
Define las dependencias del proyecto. Requiere Node.js >= 22.12.0.

**Dependencias frontend:**
- `astro` — Framework principal
- `@astrojs/react` — Integración React
- `@tauri-apps/api` — API de Tauri para el frontend
- `tailwindcss` + `@tailwindcss/typography` — Estilos
- `marked` — Parser Markdown → HTML
- `react` / `react-dom` — Librería UI

**DevDependencies:**
- `@tauri-apps/cli` — CLI de Tauri
- `@tailwindcss/vite` — Plugin Vite de TailwindCSS
- `concurrently` — Ejecutar múltiples comandos en paralelo

### App de Escritorio (Tauri)

#### `src-tauri/tauri.conf.json`
Configuración de la app de escritorio:
- Ventana de 1280x800, centrada
- Frontend: `../dist` (build de Astro)
- Dev URL: `http://localhost:4321`
- CSP: permite WebSocket a `ws://localhost:9876`
- Resources: empaqueta `resources/sidecar/**/*` dentro del `.app`

#### `src-tauri/Cargo.toml`
Dependencias Rust:
- `tauri` — Framework principal
- `tauri-plugin-log` — Logging
- `which` — Localizar binario de `node` en el PATH

#### `src-tauri/src/lib.rs`
Backend Rust de la app Tauri:
- **`start_sidecar()`**: Localiza `node` en el PATH, ejecuta el sidecar desde `resources/sidecar/index.mjs`
- **`stop_sidecar()`**: Mata el proceso del sidecar al cerrar la ventana
- El sidecar se auto-inicia en el setup de Tauri y se mata en `WindowEvent::Destroyed`

#### `src-tauri/src/main.rs`
Entry point. Previene ventana de consola en Windows release.

### Sidecar P2P

#### `sidecar/index.mjs`
Servidor Node.js que corre junto a la app:
- **WebSocket Server** (`localhost:9876`): puente entre el frontend React y la red P2P
- **Hyperswarm**: DHT descentralizada para descubrimiento y conexión entre peers
- Gestiona salas, sincronización de documentos, broadcast de cambios y cursores

#### `sidecar/package.json`
Dependencias del sidecar:
- `hyperswarm` — DHT P2P descentralizada (descubrimiento + conexión directa)
- `ws` — Servidor WebSocket

### Páginas y Layouts

#### `src/pages/index.astro`
La única página del proyecto. Importa el layout `Base` y el componente React `EditorApp` con `client:load`.

#### `src/layouts/Base.astro`
Layout HTML base con meta tags, favicon y estilos globales.

### Componentes React

#### `src/components/EditorApp.tsx`
Componente raíz. Orquesta toolbar, editor, preview y collab bar. Gestiona formateo de texto, atajos de teclado y descarga.

#### `src/components/Editor.tsx`
Editor de texto con textarea auto-expandible, números de línea, continuación de listas y overlay de cursores remotos.

#### `src/components/MarkdownPreview.tsx`
Vista previa del Markdown. Usa `marked` con GFM y renderiza con clase `prose` de Tailwind Typography.

#### `src/components/Toolbar.tsx`
Barra de herramientas con botones de formato, contador de palabras/caracteres y botón de descarga.

#### `src/components/CollabBar.tsx`
Barra de colaboración: crear/unirse a salas, copiar Room ID, salas guardadas, re-hosting.

#### `src/components/RemoteCursors.tsx`
Overlay de cursores remotos con mirror div para calcular posiciones exactas.

### Hooks

#### `src/hooks/useCollab.ts`
Hook principal de colaboración. Conecta vía WebSocket al sidecar local y gestiona salas, cambios remotos, cursores y persistencia.

### Estilos

#### `src/styles/global.css`
TailwindCSS v4 con `@theme` para design tokens, `@plugin "@tailwindcss/typography"` para estilos de markdown, y `@layer base` para estilos globales y prose.
