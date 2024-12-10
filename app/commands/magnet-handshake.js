const {
  parseMagnetLink,
  fetchMagnetPeers,
  createMagnetHandshakeRequest,
  createExtensionHandshakeRequest,
} = require('../utils/magnet');
const { connect, disconnect } = require('../utils/network');
const { decodeBencode } = require('../utils/decoder');
const { isHandshakeResponse, parseHandshake } = require('../utils/handshake');

let incomingBuffer = Buffer.alloc(0);
let handshakeReceived = false;

function processPeerMessage(message) {
  const messageId = message.readUint8(0);

  if (messageId === 20) {
    const payload = message.subarray(1);
    const dictionary = payload.subarray(1);
    const decoded = decodeBencode(dictionary);

    const peerMetadataExtensionId = decoded.m['ut_metadata'];

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

    const extensionHandshakeRequest = createExtensionHandshakeRequest(1);
    socket.write(extensionHandshakeRequest);

    socket.destroySoon();
  } catch (err) {
    console.error('Handshake failed', err);
  } finally {
    disconnect(socket);
  }
}

module.exports = handleCommand;
