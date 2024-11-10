const { readFile } = require('fs/promises');
const { decodeBencode } = require('../utils/decoder');
const { fetchPeers, sendHandshake } = require('../utils/torrent');

async function sendPeerMessage(info, peer) {
  let socket, response;
  try {
    ({ socket, peerId: response } = await sendHandshake(info, peer));
  } finally {
    if (socket) {
      socket.end;
    }
  }
}

async function handleCommand(parameters) {
  const [, , outputFile, inputFile] = parameters;
  const buffer = await readFile(inputFile);
  const torrent = decodeBencode(buffer);
  const addresses = await fetchPeers(torrent);
  const [firstPeer] = addresses;

  const response = await sendPeerMessage(torrent.info, firstPeer);
}

module.exports = handleCommand;
