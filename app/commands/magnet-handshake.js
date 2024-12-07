const {
  parseMagnetLink,
  fetchMagnetPeers,
  createMagnetHandshakeRequest,
  createExtensionHandshakeRequest,
} = require('../utils/magnet');
const { connect, disconnect } = require('../utils/network');
const { decodeBencode } = require('../utils/decoder');

let incomingBuffer = Buffer.alloc(0);
let handshakeReceived = false;
let extensionHandshakeReceived = false;
let peerMetadataExtensionId;

function isHandshakeResponse(handshakeResponse) {
  if (!handshakeResponse || handshakeResponse.length < 68) {
    return false;
  }

  const protocolLength = handshakeResponse.readUint8(0);
  const protocol = handshakeResponse.subarray(1, protocolLength + 1).toString();

  return protocol === 'BitTorrent protocol';
}

function processPeerMessage(message) {
  const messageId = message.readUint8(0);

  if (messageId === 20) {
    extensionHandshakeReceived = true;

    const payload = message.subarray(1);
    const extensionMessageId = payload.readUint8(0);
    const dictionary = payload.subarray(1);
    const decoded = decodeBencode(dictionary);

    peerMetadataExtensionId = decoded.m['ut_metadata'];

    console.log(`Peer Metadata Extension ID: ${peerMetadataExtensionId}`);
  }
}

function dataEventHandler(chunk) {
  console.log(`Response received: ${chunk.length} bytes`);
  incomingBuffer = Buffer.concat([incomingBuffer, chunk]);

  while (incomingBuffer.length >= 4) {
    if (isHandshakeResponse(incomingBuffer)) {
      const { supportsExtension, peerId } = parseHandshake(incomingBuffer);

      console.log(`Peer ID: ${peerId}`);
      incomingBuffer = incomingBuffer.slice(68);
      handshakeReceived = true;
      continue;
    }

    const messageLength = incomingBuffer.readUInt32BE(0);
    if (incomingBuffer.length < messageLength + 4) break;

    const message = incomingBuffer.slice(4, 4 + messageLength);
    processPeerMessage(message);
    incomingBuffer = incomingBuffer.slice(4 + messageLength);
  }
}

function parseHandshake(data) {
  const supportsExtension = data.readUint8(25) === 0x10;
  const peerId = data.subarray(48, 68).toString('hex');

  return { supportsExtension, peerId };
}

async function waitForHandshakeReceived() {
  return new Promise((resolve) => {
    const intervalId = setInterval(() => {
      if (handshakeReceived) {
        clearInterval(intervalId);
        resolve();
      }
    }, 1000);
  });
}

async function handleCommand(parameters) {
  const [, magnetLink] = parameters;
  const { infoHash, trackerUrl } = parseMagnetLink(magnetLink);
  const peers = await fetchMagnetPeers(infoHash, trackerUrl);

  const [peer] = peers;
  let socket;
  try {
    socket = await connect(peer.host, peer.port, dataEventHandler);

    const handshakeRequest = createMagnetHandshakeRequest(infoHash);
    socket.write(handshakeRequest);

    await waitForHandshakeReceived();

    const extensionHandshakeRequest = createExtensionHandshakeRequest(peerMetadataExtensionId);
    socket.write(extensionHandshakeRequest);

    socket.destroySoon();
  } catch (err) {
    console.error('Handshake failed', err);
  } finally {
    disconnect(socket);
  }
}

module.exports = handleCommand;
