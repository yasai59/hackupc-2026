import Hyperswarm from 'hyperswarm'
import crypto from 'crypto'
import { WebSocketServer } from 'ws'

const requestedPort = process.argv.includes('--port')
  ? parseInt(process.argv[process.argv.indexOf('--port') + 1], 10)
  : 0

const swarm = new Hyperswarm()
const peers = new Map()
const peerInfo = new Map()
let currentTopic = null
let currentRoomId = null
let documentContent = ''
let documentVersion = 0
let username = 'Writer'
const myPeerId = crypto.randomBytes(8).toString('hex')

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

  sendToFrontend({ type: 'connected', peerId: myPeerId })

  if (currentRoomId) {
    sendToFrontend({
      type: 'room-restored',
      roomId: currentRoomId,
      content: documentContent,
      peerCount: peers.size,
    })
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

function handleFrontendMessage(msg) {
  switch (msg.type) {
    case 'create':
      createRoom(msg.content)
      break
    case 'join':
      joinRoom(msg.roomId, msg.content)
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
    default:
      break
  }
}

function cleanupPeers() {
  for (const stream of peers.values()) {
    try { stream.end() } catch {}
  }
  peers.clear()
  peerInfo.clear()
}

function createRoom(content) {
  if (currentTopic) {
    swarm.leave(currentTopic)
    cleanupPeers()
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

function joinRoom(roomId, content) {
  if (currentTopic) {
    swarm.leave(currentTopic)
    cleanupPeers()
  }

  currentRoomId = roomId
  documentContent = content || ''
  documentVersion = 0
  currentTopic = crypto.createHash('sha256').update(currentRoomId).digest()

  swarm.join(currentTopic, { server: true, client: true })

  sendToFrontend({
    type: 'room-joined',
    roomId: currentRoomId,
    content: documentContent,
  })

  console.log(`Joined room: ${currentRoomId}`)
}

function leaveRoom() {
  if (currentTopic) {
    swarm.leave(currentTopic)
    currentTopic = null
  }

  cleanupPeers()
  currentRoomId = null
  documentContent = ''
  documentVersion = 0

  sendToFrontend({ type: 'left', peerCount: 0 })

  console.log('Left room')
}

function handleChange(msg) {
  documentContent = msg.text
  documentVersion++

  broadcastToPeers({
    type: 'change',
    text: msg.text,
    version: documentVersion,
    editStart: msg.editStart,
    editDeletedLen: msg.editDeletedLen,
    editInsertedLen: msg.editInsertedLen,
    peerId: myPeerId,
  })
}

function handleCursor(msg) {
  broadcastToPeers({
    type: 'cursor',
    position: msg.position,
    peerId: myPeerId,
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

swarm.on('connection', (stream) => {
  const streamPeerId = stream.remotePublicKey.toString('hex').slice(0, 16)

  if (peers.has(streamPeerId)) {
    try { peers.get(streamPeerId).end() } catch {}
  }
  peers.set(streamPeerId, stream)

  let buffer = ''

  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        handlePeerMessage(msg, streamPeerId)
      } catch (err) {
        console.error('Parse error:', err)
      }
    }
  })

  stream.on('close', () => {
    if (peers.get(streamPeerId) === stream) {
      peers.delete(streamPeerId)
      const info = peerInfo.get(streamPeerId)
      peerInfo.delete(streamPeerId)

      sendToFrontend({
        type: 'peer-disconnected',
        peerId: info ? info.peerId : streamPeerId,
        peerCount: peers.size,
      })
      console.log(`Peer disconnected: ${streamPeerId}`)
    }
  })

  stream.on('error', (err) => {
    console.error(`Stream error from ${streamPeerId}:`, err)
    if (peers.get(streamPeerId) === stream) {
      peers.delete(streamPeerId)
      const info = peerInfo.get(streamPeerId)
      peerInfo.delete(streamPeerId)

      sendToFrontend({
        type: 'peer-disconnected',
        peerId: info ? info.peerId : streamPeerId,
        peerCount: peers.size,
      })
    }
  })

  sendToFrontend({
    type: 'peer-connected',
    peerId: streamPeerId,
    peerCount: peers.size,
  })

  console.log(`Peer connected: ${streamPeerId}`)

  sendToPeer(streamPeerId, {
    type: 'sync',
    text: documentContent,
    version: documentVersion,
    peerId: myPeerId,
    name: username,
  })
})

function handlePeerMessage(msg, fromStreamPeerId) {
  switch (msg.type) {
    case 'change': {
      if (msg.version > documentVersion) {
        documentContent = msg.text
        documentVersion = msg.version

        sendToFrontend({
          type: 'remote-change',
          text: msg.text,
          editStart: msg.editStart,
          editDeletedLen: msg.editDeletedLen,
          editInsertedLen: msg.editInsertedLen,
          peerId: msg.peerId,
        })

        relayToOtherPeers(fromStreamPeerId, {
          type: 'change',
          text: msg.text,
          version: msg.version,
          editStart: msg.editStart,
          editDeletedLen: msg.editDeletedLen,
          editInsertedLen: msg.editInsertedLen,
          peerId: msg.peerId,
        })
      }
      break
    }

    case 'cursor':
      peerInfo.set(fromStreamPeerId, { peerId: msg.peerId, name: msg.name })
      sendToFrontend({
        type: 'remote-cursor',
        position: msg.position,
        peerId: msg.peerId,
        color: msg.color,
        name: msg.name,
      })
      relayToOtherPeers(fromStreamPeerId, msg)
      break

    case 'sync': {
      peerInfo.set(fromStreamPeerId, { peerId: msg.peerId, name: msg.name || 'Writer' })

      if (msg.version > documentVersion && msg.text.length > 0) {
        documentContent = msg.text
        documentVersion = msg.version

        sendToFrontend({
          type: 'remote-change',
          text: msg.text,
          peerId: msg.peerId,
        })
      }

      sendToPeer(fromStreamPeerId, {
        type: 'sync-ack',
        text: documentContent,
        version: documentVersion,
        peerId: myPeerId,
        name: username,
      })
      break
    }

    case 'sync-ack': {
      peerInfo.set(fromStreamPeerId, { peerId: msg.peerId, name: msg.name || 'Writer' })

      if (msg.version > documentVersion && msg.text.length > 0) {
        documentContent = msg.text
        documentVersion = msg.version

        sendToFrontend({
          type: 'remote-change',
          text: msg.text,
          peerId: msg.peerId,
        })
      }
      break
    }
  }
}

swarm.on('error', (err) => {
  console.error('Swarm error:', err)
})

console.log(`Inkwell P2P sidecar running on ws://localhost:${SWARM_PORT}`)
console.log(`My Peer ID: ${myPeerId}`)