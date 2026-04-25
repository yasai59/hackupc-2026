import Hyperswarm from 'hyperswarm'
import crypto from 'crypto'
import { WebSocketServer } from 'ws'

const requestedPort = process.argv.includes('--port')
  ? parseInt(process.argv[process.argv.indexOf('--port') + 1], 10)
  : 0

const swarm = new Hyperswarm()
const peers = new Map()
const peerNames = new Map()
const peerLeftNotified = new Set()
let currentTopic = null
let currentRoomId = null
let documentContent = ''
let documentVersion = 0
let username = 'Writer'

const wss = new WebSocketServer({ port: requestedPort, host: '127.0.0.1' })

await new Promise((resolve) => {
  wss.on('listening', resolve)
})

const SWARM_PORT = wss.address().port

process.stderr.write(`SIDECAR_PORT:${SWARM_PORT}\n`)

let frontendClient = null

wss.on('connection', (ws) => {
  if (frontendClient && frontendClient.readyState === 1) {
    frontendClient.close()
  }
  frontendClient = ws

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      handleFrontendMessage(msg)
    } catch (err) {
      console.error('Invalid message from frontend:', err)
    }
  })

  ws.on('close', () => {
    if (frontendClient === ws) frontendClient = null
  })

  sendToFrontend({ type: 'connected' })

  if (currentRoomId) {
    sendToFrontend({
      type: 'room-restored',
      roomId: currentRoomId,
      content: documentContent,
      peerCount: peers.size,
    })

    for (const [pid, name] of peerNames) {
      sendToFrontend({
        type: 'peer-connected',
        peerId: pid,
        peerCount: peers.size,
        name: name || '',
      })
    }
  }
})

function sendToFrontend(msg) {
  if (frontendClient && frontendClient.readyState === 1) {
    frontendClient.send(JSON.stringify(msg))
  }
}

function sendToPeer(streamPeerId, msg) {
  const stream = peers.get(streamPeerId)
  if (stream && !stream.destroyed) {
    try {
      stream.write(JSON.stringify(msg) + '\n')
    } catch {}
  }
}

function relayToOtherPeers(fromStreamPeerId, msg) {
  const data = JSON.stringify(msg) + '\n'
  for (const [pid, stream] of peers) {
    if (pid !== fromStreamPeerId) {
      try {
        stream.write(data)
      } catch {}
    }
  }
}

function requestSyncFromAllPeers() {
  const msg = JSON.stringify({ type: 'request-sync', name: username }) + '\n'
  for (const stream of peers.values()) {
    try { stream.write(msg) } catch {}
  }
}

function handleFrontendMessage(msg) {
  switch (msg.type) {
    case 'create':
      createRoom(msg.content)
      break
    case 'join':
      joinRoom(msg.roomId)
      break
    case 'leave':
      leaveRoom()
      break
    case 'change':
      handleChange(msg)
      break
    case 'cursor':
      handleCursor(msg)
      break
    case 'username':
      username = msg.username || 'Writer'
      break
    case 'request-sync':
      requestSyncFromAllPeers()
      break
    default:
      break
  }
}

function announceLeaving() {
  if (peers.size === 0) return
  const msg = JSON.stringify({ type: 'peer-leaving', name: username }) + '\n'
  for (const stream of peers.values()) {
    try { stream.write(msg) } catch {}
  }
}

function forceClosePeers() {
  for (const stream of peers.values()) {
    try { stream.end() } catch {}
  }
  peers.clear()
  peerNames.clear()
  peerLeftNotified.clear()
}

function createRoom(content) {
  if (currentTopic) {
    announceLeaving()
    swarm.leave(currentTopic)
    forceClosePeers()
  }

  const id = Math.random().toString(36).slice(2, 8)
  currentRoomId = 'inkwell-' + id
  documentContent = content || ''
  documentVersion = 1
  currentTopic = crypto.createHash('sha256').update(currentRoomId).digest()

  swarm.join(currentTopic, { server: true, client: true })

  sendToFrontend({
    type: 'room-created',
    roomId: currentRoomId,
    content: documentContent,
  })

  console.log(`Room created: ${currentRoomId}`)
}

function joinRoom(roomId) {
  if (currentTopic) {
    announceLeaving()
    swarm.leave(currentTopic)
    forceClosePeers()
  }

  currentRoomId = roomId
  documentContent = ''
  documentVersion = 0
  currentTopic = crypto.createHash('sha256').update(currentRoomId).digest()

  swarm.join(currentTopic, { server: true, client: true })

  sendToFrontend({
    type: 'room-joined',
    roomId: currentRoomId,
    syncing: true,
  })

  console.log(`Joined room: ${currentRoomId}`)
}

function leaveRoom() {
  if (currentTopic) {
    announceLeaving()
    swarm.leave(currentTopic)
    currentTopic = null
  }

  forceClosePeers()
  currentRoomId = null
  documentContent = ''
  documentVersion = 0

  sendToFrontend({ type: 'left', peerCount: 0 })

  console.log('Left room')
}

function handleChange(msg) {
  if (!currentRoomId) return

  documentContent = msg.text
  documentVersion++

  broadcastToPeers({
    type: 'change',
    text: msg.text,
    version: documentVersion,
    editStart: msg.editStart,
    editDeletedLen: msg.editDeletedLen,
    editInsertedLen: msg.editInsertedLen,
    name: username,
  })
}

function handleCursor(msg) {
  if (!currentRoomId) return

  broadcastToPeers({
    type: 'cursor',
    position: msg.position,
    color: msg.color,
    name: username,
  })
}

function broadcastToPeers(msg) {
  const data = JSON.stringify(msg) + '\n'
  for (const stream of peers.values()) {
    try {
      stream.write(data)
    } catch (err) {
      console.error('Error sending to peer:', err)
    }
  }
}

function notifyPeerLeft(streamPeerId) {
  if (peerLeftNotified.has(streamPeerId)) return
  peerLeftNotified.add(streamPeerId)

  const name = peerNames.get(streamPeerId) || ''

  sendToFrontend({
    type: 'peer-disconnected',
    peerId: streamPeerId,
    peerCount: Math.max(0, peers.size - 1),
    name,
  })

  for (const [pid, peerStream] of peers) {
    if (pid !== streamPeerId) {
      try {
        peerStream.write(JSON.stringify({ type: 'peer-leaving', sourcePeerId: streamPeerId, name }) + '\n')
      } catch {}
    }
  }
}

swarm.on('connection', (stream) => {
  const streamPeerId = stream.remotePublicKey.toString('hex').slice(0, 16)

  if (peers.has(streamPeerId)) {
    try { peers.get(streamPeerId).end() } catch {}
  }
  peers.set(streamPeerId, stream)
  peerLeftNotified.delete(streamPeerId)

  let buffer = ''

  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        handlePeerMessage(msg, streamPeerId, stream)
      } catch (err) {
        console.error('Parse error:', err)
      }
    }
  })

  stream.on('close', () => {
    if (peers.get(streamPeerId) === stream) {
      const name = peerNames.get(streamPeerId) || ''
      peers.delete(streamPeerId)
      peerNames.delete(streamPeerId)
      notifyPeerLeft(streamPeerId)
      console.log(`Peer disconnected: ${streamPeerId}`)
    }
  })

  stream.on('error', (err) => {
    console.error(`Stream error from ${streamPeerId}:`, err)
    if (peers.get(streamPeerId) === stream) {
      const name = peerNames.get(streamPeerId) || ''
      peers.delete(streamPeerId)
      peerNames.delete(streamPeerId)
      notifyPeerLeft(streamPeerId)
    }
  })

  sendToFrontend({
    type: 'peer-connected',
    peerId: streamPeerId,
    peerCount: peers.size,
    name: peerNames.get(streamPeerId) || '',
  })

  console.log(`Peer connected: ${streamPeerId}`)

  sendToPeer(streamPeerId, {
    type: 'sync',
    text: documentContent,
    version: documentVersion,
    name: username,
  })

  sendToPeer(streamPeerId, {
    type: 'request-sync',
    name: username,
  })
})

function handlePeerMessage(msg, fromStreamPeerId, fromStream) {
  if (!currentRoomId && msg.type !== 'peer-leaving') return

  const senderName = msg.name || peerNames.get(fromStreamPeerId) || 'Writer'
  if (msg.name) peerNames.set(fromStreamPeerId, msg.name)

  const displayPeerId = msg.sourcePeerId || fromStreamPeerId
  if (msg.sourcePeerId && msg.name) peerNames.set(msg.sourcePeerId, msg.name)

  switch (msg.type) {
    case 'peer-leaving': {
      const leavingId = msg.sourcePeerId || fromStreamPeerId
      const leavingName = msg.name || peerNames.get(leavingId) || ''

      if (peers.has(leavingId)) {
        const leavingStream = peers.get(leavingId)
        peers.delete(leavingId)
        peerNames.delete(leavingId)
        try { leavingStream.end() } catch {}
      }

      notifyPeerLeft(leavingId)
      break
    }

    case 'change': {
      if (msg.version > documentVersion) {
        documentContent = msg.text
        documentVersion = msg.version

        sendToFrontend({
          type: 'remote-change',
          text: msg.text,
          peerId: displayPeerId,
          editStart: msg.editStart,
          editDeletedLen: msg.editDeletedLen,
          editInsertedLen: msg.editInsertedLen,
          peerName: senderName,
        })

        relayToOtherPeers(fromStreamPeerId, {
          type: 'change',
          text: msg.text,
          version: msg.version,
          editStart: msg.editStart,
          editDeletedLen: msg.editDeletedLen,
          editInsertedLen: msg.editInsertedLen,
          name: senderName,
          sourcePeerId: displayPeerId,
        })
      }
      break
    }

    case 'cursor':
      sendToFrontend({
        type: 'remote-cursor',
        position: msg.position,
        peerId: displayPeerId,
        color: msg.color,
        name: senderName,
      })
      relayToOtherPeers(fromStreamPeerId, {
        type: 'cursor',
        position: msg.position,
        color: msg.color,
        name: senderName,
        sourcePeerId: displayPeerId,
      })
      break

    case 'sync': {
      if (msg.version > documentVersion) {
        documentContent = msg.text
        documentVersion = msg.version

        sendToFrontend({
          type: 'remote-change',
          text: msg.text,
          peerId: displayPeerId,
          peerName: senderName,
        })
      }

      sendToPeer(fromStreamPeerId, {
        type: 'sync-ack',
        text: documentContent,
        version: documentVersion,
        name: username,
      })
      break
    }

    case 'sync-ack': {
      if (msg.version > documentVersion) {
        documentContent = msg.text
        documentVersion = msg.version

        sendToFrontend({
          type: 'remote-change',
          text: msg.text,
          peerId: displayPeerId,
          peerName: senderName,
        })
      }
      break
    }

    case 'request-sync': {
      sendToPeer(fromStreamPeerId, {
        type: 'sync',
        text: documentContent,
        version: documentVersion,
        name: username,
      })

      relayToOtherPeers(fromStreamPeerId, {
        type: 'request-sync',
        name: username,
        sourcePeerId: displayPeerId,
      })
      break
    }
  }
}

swarm.on('error', (err) => {
  console.error('Swarm error:', err)
})

console.log(`Inkwell P2P sidecar running on ws://localhost:${SWARM_PORT}`)