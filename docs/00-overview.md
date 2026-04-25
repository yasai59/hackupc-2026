# Inkwell — Editor Markdown Colaborativo

## Descripción General

**Inkwell** es un editor de Markdown colaborativo en tiempo real construido con **Astro** y **React**. Permite a múltiples usuarios editar el mismo documento simultáneamente mediante una arquitectura **peer-to-peer (P2P)** basada en **WebRTC** a través de la librería **PeerJS**.

El proyecto fue diseñado para funcionar sin servidor central de sincronización: los peers se conectan directamente entre sí y propagan los cambios de forma descentralizada.

## Tecnologías Principales

| Tecnología | Uso |
|---|---|
| **Astro 6** | Framework base, routing y renderizado SSR/SSG |
| **React 19** | Componentes UI interactivos (editor, toolbar, preview) |
| **PeerJS 1.5** | Abstracción de WebRTC para conexiones P2P |
| **Marked 18** | Parseo de Markdown a HTML para la vista previa |
| **TypeScript 5.9** | Tipado estático en todo el proyecto |

## Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────┐
│                   Astro App                      │
│  ┌───────────────────────────────────────────┐  │
│  │           index.astro (ruta /)             │  │
│  │     Renderiza EditorApp con client:load    │  │
│  └───────────────────────────────────────────┘  │
│                     │                            │
│  ┌──────────────────▼──────────────────────┐    │
│  │          EditorApp.tsx (React)           │    │
│  │  ┌────────────┐  ┌──────────────────┐   │    │
│  │  │  Toolbar   │  │   CollabBar      │   │    │
│  │  └────────────┘  └──────────────────┘   │    │
│  │  ┌────────────┐  ┌──────────────────┐   │    │
│  │  │  Editor    │  │ MarkdownPreview  │   │    │
│  │  │ (+Remote   │  │                  │   │    │
│  │  │  Cursors)  │  │                  │   │    │
│  │  └────────────┘  └──────────────────┘   │    │
│  └──────────────────────────────────────────┘    │
│                     │                            │
│  ┌──────────────────▼──────────────────────┐    │
│  │        useCollab.ts (Custom Hook)        │    │
│  │  ┌───────────────────────────────────┐  │    │
│  │  │         PeerJS (WebRTC)           │  │    │
│  │  │   Signaling via PeerServer cloud  │  │    │
│  │  │   Mesh network entre peers        │  │    │
│  │  └───────────────────────────────────┘  │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
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

### Colaboración P2P
- Creación de salas (rooms) con ID único
- Unión a salas existentes mediante ID
- Sincronización automática del documento al unirse
- Cursores remotos visibles con nombre y color de cada peer
- Mesh network: cada peer se conecta a todos los demás
- Persistencia local de documentos y salas en `localStorage`
- Re-hosting de documentos guardados

### Vista Previa
- Renderizado en tiempo real del Markdown a HTML
- Soporte de GFM (GitHub Flavored Markdown)
- Saltos de línea automáticos

## Flujo de Colaboración

1. **Usuario A** pulsa "Create Room" → se genera un Peer con ID único
2. **Usuario A** copia el Room ID y lo comparte
3. **Usuario B** pulsa "Join Room" e introduce el ID
4. **Usuario B** envía un `sync-request` al host → recibe el documento actual
5. Cada vez que un usuario escribe, se broadcastea un mensaje `change` con el diff
6. Los cursores se broadcastean con throttle de 50ms
7. Al desconectarse, el documento se guarda en `localStorage`

## Comandos del Proyecto

```bash
npm run dev       # Servidor de desarrollo en localhost:4321
npm run build     # Build de producción en ./dist/
npm run preview   # Preview del build local
npm run astro     # CLI de Astro
```
