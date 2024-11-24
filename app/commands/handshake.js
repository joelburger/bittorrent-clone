const { readFile } = require('fs/promises');
const { decodeBencode } = require('../utils/decoder');
const { createHandshakeRequest } = require('../utils/torrent');
const { disconnect, connect } = require('../utils/network');

async function sendHandshake(info, { host, port }) {
  return new Promise(async (resolve, reject) => {
    try {
      const socket = await connect(host, port, (data) => {
        console.log('Handshake successful');
        resolve({ socket, data });
      });
      console.log(`Sending handshake to ${host}:${port}`);
      const buffer = createHandshakeRequest(info);
      socket.write(buffer);
    } catch (err) {
      console.error('Handshake error', err);
      reject(err);
    }
  });
}

async function handleCommand(parameters) {
  const [, inputFile, peer] = parameters;
  const [host, portAsString] = peer.split(':');
  const port = parseInt(portAsString, 10);
  const buffer = await readFile(inputFile);
  const { info } = decodeBencode(buffer);

  let socket, data;
  try {
    ({ socket, data } = await sendHandshake(info, { host, port }));
    const peerId = data.subarray(48, 68).toString('hex');
    console.log(`Peer ID: ${peerId}`);
  } finally {
    disconnect(socket);
  }
}

module.exports = handleCommand;
