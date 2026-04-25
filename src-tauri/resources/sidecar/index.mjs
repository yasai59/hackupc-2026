import Hyperswarm from 'hyperswarm'
import crypto from 'crypto'
import { WebSocketServer } from 'ws'

const requestedPort = process.argv.includes('--port')
  ? parseInt(process.argv[process.argv.indexOf('--port') + 1], 10)
  : 0

const swarm = new Hyperswarm()
const peers = new Map()
let currentTopic = null
let currentRoomId = null
let documentContent = ''
let isRoomCreator = false
let awaitingInitialSync = false
let username = 'Writer'
let myPeerId = crypto.randomBytes(8).toString('hex')

const wss = new WebSocketServer({ port: requestedPort, host: '127.0.0.1' })

// Wait for the server to be listening before reading the port
await new Promise((resolve) => {
  wss.on('listening', resolve)
})

const SWARM_PORT = wss.address().port

process.stderr.write(`SIDECAR_PORT:${SWARM_PORT}\n`)

let frontendClient = null

wss.on('connection', (ws) => {
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

function createRoom(content) {
  if (currentRoomId) leaveRoom()

  const id = Math.random().toString(36).slice(2, 8)
  currentRoomId = 'inkwell-' + id
  documentContent = content || ''
  isRoomCreator = true
  awaitingInitialSync = false
  const topicBuffer = crypto.createHash('sha256').update(currentRoomId).digest()

  currentTopic = topicBuffer
  swarm.join(topicBuffer, { server: true, client: true })

  sendToFrontend({
    type: 'room-created',
    roomId: currentRoomId,
    content: documentContent,
  })

  console.log(`Room created: ${currentRoomId}`)
}

function joinRoom(roomId, content) {
  if (currentRoomId) leaveRoom()

  currentRoomId = roomId
  documentContent = content || ''
  isRoomCreator = false
  awaitingInitialSync = true
  const topicBuffer = crypto.createHash('sha256').update(currentRoomId).digest()

  currentTopic = topicBuffer
  swarm.join(topicBuffer, { server: true, client: true })

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

  for (const stream of peers.values()) {
    try { stream.end() } catch {}
  }
  peers.clear()
  currentRoomId = null
  isRoomCreator = false
  awaitingInitialSync = false

  sendToFrontend({
    type: 'left',
    peerCount: 0,
  })

  console.log('Left room')
}

function handleChange(msg) {
  documentContent = msg.text
  broadcastToPeers({
    type: 'change',
    text: msg.text,
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
  const peerId = stream.remotePublicKey.toString('hex').slice(0, 16)
  peers.set(peerId, stream)

  let buffer = ''

  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        handlePeerMessage(msg, peerId)
      } catch (err) {
        console.error('Parse error:', err)
      }
    }
  })

  stream.on('close', () => {
    peers.delete(peerId)
    sendToFrontend({
      type: 'peer-disconnected',
      peerId,
      peerCount: peers.size,
    })
    console.log(`Peer disconnected: ${peerId}`)
  })

  stream.on('error', (err) => {
    console.error(`Stream error from ${peerId}:`, err)
    peers.delete(peerId)
  })

  sendToFrontend({
    type: 'peer-connected',
    peerId,
    peerCount: peers.size,
  })

  console.log(`Peer connected: ${peerId}`)

  stream.write(JSON.stringify({
    type: 'sync-response',
    text: documentContent,
    peerId: myPeerId,
    name: username,
  }) + '\n')
})

function handlePeerMessage(msg, fromPeerId) {
  switch (msg.type) {
    case 'change':
      documentContent = msg.text
      sendToFrontend({
        type: 'remote-change',
        text: msg.text,
        editStart: msg.editStart,
        editDeletedLen: msg.editDeletedLen,
        editInsertedLen: msg.editInsertedLen,
        peerId: msg.peerId,
      })
      break

    case 'cursor':
      sendToFrontend({
        type: 'remote-cursor',
        position: msg.position,
        peerId: msg.peerId,
        color: msg.color,
        name: msg.name,
      })
      break

    case 'sync-response':
      if (awaitingInitialSync || documentContent.length === 0) {
        documentContent = msg.text
        awaitingInitialSync = false
      }
      sendToFrontend({
        type: 'remote-change',
        text: documentContent,
        peerId: msg.peerId || fromPeerId,
      })
      break
  }
}

swarm.on('error', (err) => {
  console.error('Swarm error:', err)
})

console.log(`Inkwell P2P sidecar running on ws://localhost:${SWARM_PORT}`)
console.log(`My Peer ID: ${myPeerId}`)