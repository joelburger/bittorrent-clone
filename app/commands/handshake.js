const { readFile } = require('fs/promises');
const { decodeBencode } = require('../utils/decoder');
const { sendHandshake } = require('../utils/torrent');
const { disconnect } = require('../utils/network');

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
