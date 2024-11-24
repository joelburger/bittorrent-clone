const { parseMagnetLink, fetchMagnetPeers, createMagnetHandshakeRequest } = require('../utils/magnet');
const { connect, disconnect } = require('../utils/network');
const { createHandshakeRequest } = require('../utils/torrent');

async function sendHandshake(infoHash, { host, port }) {
  return new Promise(async (resolve, reject) => {
    const socket = await connect(host, port, (data) => {
      console.log('Handshake successful');
      resolve({ socket, data });
    });

    socket.on('error', (err) => {
      reject(err);
    });

    console.log(`Sending handshake to ${host}:${port}`);
    console.log({ infoHash });
    const buffer = createMagnetHandshakeRequest(infoHash);
    socket.write(buffer);
  });
}

async function handleCommand(parameters) {
  const [, magnetLink] = parameters;
  const { infoHash, fileName, trackerUrl } = parseMagnetLink(magnetLink);
  const peers = await fetchMagnetPeers(infoHash, trackerUrl);

  let socket, data;
  try {
    ({ socket, data } = await sendHandshake(infoHash, peers[0]));
    const peerId = data.subarray(48, 68).toString('hex');
    console.log(`Peer ID: ${peerId}`);
  } catch (err) {
    console.error('Handshake failed', err);
  } finally {
    disconnect(socket);
  }
}

module.exports = handleCommand;
