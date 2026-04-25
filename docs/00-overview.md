# Inkwell — Editor Markdown Colaborativo

## Descripción General

**Inkwell** es un editor de Markdown colaborativo en tiempo real empaquetado como **aplicación de escritorio** con **Tauri**. Permite a múltiples usuarios editar el mismo documento simultáneamente mediante una arquitectura **peer-to-peer (P2P)** completamente descentralizada usando **Hyperswarm** (DHT).

**Cero dependencia de servidores externos.** Todo el tráfico P2P va directamente entre peers a través de la DHT de Hyperswarm. El signaling, descubrimiento y transferencia de datos son 100% descentralizados.

## Tecnologías Principales

| Tecnología | Uso |
|---|---|
| **Tauri 2** | Framework de app de escritorio (Rust + WebView) |
| **Astro 6** | Framework web, routing y build del frontend |
| **React 19** | Componentes UI interactivos (editor, toolbar, preview) |
| **TailwindCSS 4** | Sistema de estilos con design tokens |
| **Hyperswarm** | DHT descentralizada para descubrimiento y conexión P2P |
| **Marked 18** | Parseo de Markdown a HTML para la vista previa |
| **TypeScript 5.9** | Tipado estático en todo el proyecto |

## Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────────────┐
│                  Tauri App (Rust)                        │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │              WebView (Frontend)                    │  │
│  │  ┌───────────────────────────────────────────┐   │  │
│  │  │           index.astro (ruta /)             │   │  │
│  │  │     Renderiza EditorApp con client:load    │   │  │
│  │  └───────────────────────────────────────────┘   │  │
│  │                     │                             │  │
│  │  ┌──────────────────▼──────────────────────┐    │  │
│  │  │          EditorApp.tsx (React)           │    │  │
│  │  │  ┌────────────┐  ┌──────────────────┐   │    │  │
│  │  │  │  Toolbar   │  │   CollabBar      │   │    │  │
│  │  │  └────────────┘  └──────────────────┘   │    │  │
│  │  │  ┌────────────┐  ┌──────────────────┐   │    │  │
│  │  │  │  Editor    │  │ MarkdownPreview  │   │    │  │
│  │  │  │ (+Remote   │  │   (prose styles) │   │    │  │
│  │  │  │  Cursors)  │  │                  │   │    │  │
│  │  │  └────────────┘  └──────────────────┘   │    │  │
│  │  └──────────────────────────────────────────┘    │  │
│  │                     │                             │  │
│  │  ┌──────────────────▼──────────────────────┐    │  │
│  │  │        useCollab.ts (Custom Hook)        │    │  │
│  │  │         WebSocket → localhost:9876       │    │  │
│  │  └──────────────────┬───────────────────────┘    │  │
│  └─────────────────────┼───────────────────────────┘  │
│                        │                               │
│  ┌─────────────────────▼───────────────────────────┐  │
│  │         Sidecar (Node.js, auto-start)            │  │
│  │  ┌───────────────────────────────────────────┐  │  │
│  │  │  Hyperswarm (DHT descentralizada)         │  │  │
│  │  │   ├── Descubrimiento de peers (DHT)       │  │  │
│  │  │   ├── Conexión directa peer-to-peer       │  │  │
│  │  │   ├── Encriptación Noise                  │  │  │
│  │  │   └── NAT traversal automático            │  │  │
│  │  │                                            │  │  │
│  │  │  WebSocket Server (localhost:9876)         │  │  │
│  │  │   └── Puente frontend ↔ P2P               │  │  │
│  │  └───────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Rust Backend (lib.rs)                           │   │
│  │   ├── Auto-start del sidecar al lanzar la app   │   │
│  │   ├── Kill del sidecar al cerrar la app          │   │
│  │   └── Sin servidor externo jamás                 │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Características Principales

### Editor
- Editor de texto con textarea auto-expandible
- Números de línea laterales
- Soporte de listas automáticas (ul/ol) con continuación al pulsar Enter
- Atajos de teclado: `Ctrl+B` (bold), `Ctrl+I` (italic), `Tab` (indentación)

### Toolbar
- Formato de texto: H1, H2, H3, Bold, Italic, Strikethrough, Blockquote, Code, Code Block, Horizontal Rule, Listas, Links
- Contador de palabras y caracteres
- Descarga del documento como archivo `.md`

### Colaboración P2P (100% descentralizada)
- Creación de salas (rooms) con ID único
- Unión a salas existentes mediante ID
- Sincronización automática del documento al unirse
- Cursores remotos visibles con nombre y color de cada peer
- Mesh network: cada peer se conecta a todos los demás
- Persistencia local de documentos y salas en `localStorage`
- Re-hosting de documentos guardados
- **Sin servidor de signaling** — Hyperswarm usa DHT descentralizada
- **Sin servidor de datos** — conexiones directas peer-to-peer

### Vista Previa
- Renderizado en tiempo real del Markdown a HTML
- Soporte de GFM (GitHub Flavored Markdown)
- Estilos de tipografía con `@tailwindcss/typography` (prose)
- Saltos de línea automáticos

### App de Escritorio
- Empaquetada con Tauri (~10MB vs ~150MB de Electron)
- Sidecar Node.js auto-iniciado al abrir la app
- Sidecar empaquetado dentro del `.app`/`.dmg`
- Cleanup automático del sidecar al cerrar la app

## Flujo de Colaboración

1. **Usuario A** abre la app → Tauri auto-inicia el sidecar con Hyperswarm
2. **Usuario A** pulsa "Create Room" → se genera un ID y se une a la DHT
3. **Usuario A** copia el Room ID y lo comparte
4. **Usuario B** abre la app → su sidecar también se auto-inicia
5. **Usuario B** pulsa "Join Room" e introduce el ID → Hyperswarm descubre a A vía DHT
6. Se establece conexión directa P2P → B recibe el documento actual
7. Cada vez que un usuario escribe, se broadcastea un mensaje `change` con el diff
8. Los cursores se broadcastean con throttle de 50ms
9. Al desconectarse, el documento se guarda en `localStorage`

## Comandos del Proyecto

```bash
# Desarrollo web (sin Tauri)
npm run dev              # Solo Astro dev server
npm run dev:sidecar      # Solo sidecar P2P
npm run dev:all          # Sidecar + Astro en paralelo

# App de escritorio
npm run tauri:dev        # Tauri dev mode (auto-inicia sidecar)
npm run tauri:build      # Build de producción (.app / .dmg)

# Build del frontend
npm run build            # Build Astro en ./dist/
npm run preview          # Preview del build local
```

## Output de Build

```
src-tauri/target/release/bundle/
├── macos/
│   └── Inkwell.app              # App de macOS
└── dmg/
    └── Inkwell_0.1.0_aarch64.dmg # Instalador DMG
```
