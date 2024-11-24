const {
  parseMagnetLink,
  fetchMagnetPeers,
  createMagnetHandshakeRequest,
  createExtensionHandshakeRequest,
} = require('../utils/magnet');
const { connect, disconnect } = require('../utils/network');

let incomingBuffer = Buffer.alloc(0);

function dataEventHandler(data) {
  console.log(`Received ${data.length} bytes`);
  incomingBuffer = Buffer.concat([incomingBuffer, data]);
}

function parseHandshake(data) {
  const supportsExtension = data.readUint8(25) === 0x10;
  const peerId = data.subarray(48, 68).toString('hex');

  return { supportsExtension, peerId };
}

async function fetchResponse() {
  return new Promise((resolve, reject) => {
    let intervalId;
    const timeoutId = setTimeout(() => {
      reject('Timed out while waiting for response');
      clearInterval(intervalId);
    }, 30000);

    intervalId = setInterval(() => {
      if (incomingBuffer.length > 0) {
        resolve(incomingBuffer);
        incomingBuffer = Buffer.alloc(0);
        clearInterval(intervalId);
      }
    }, 1000);
  });
}

async function handleCommand(parameters) {
  const [, magnetLink] = parameters;
  const { infoHash, fileName, trackerUrl } = parseMagnetLink(magnetLink);
  const peers = await fetchMagnetPeers(infoHash, trackerUrl);

  const [peer] = peers;
  let socket;
  try {
    socket = await connect(peer.host, peer.port, dataEventHandler);

    console.log(`Sending handshake to ${peer.host}:${peer.port}`);
    const handshakeRequest = createMagnetHandshakeRequest(infoHash, true);
    socket.write(handshakeRequest);
    const handshakeResponse = await fetchResponse();
    const { supportsExtension, peerId } = parseHandshake(handshakeResponse);

    if (supportsExtension) {
      console.log('Sending extension handshake');
      const extensionHandshake = createExtensionHandshakeRequest();
      socket.write(extensionHandshake);

      console.log(`Peer ID: ${peerId}`);
      socket.destroy();
      process.exit();
    } else {
      console.log(`Peer ${peer} does not support extensions`);
    }
  } catch (err) {
    console.error('Handshake failed', err);
  } finally {
    console.log('Disconnecting socket');
    disconnect(socket);
  }
}

module.exports = handleCommand;
