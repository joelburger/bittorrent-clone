const { readFile } = require('fs/promises');
const { decodeBencode } = require('../utils/decoder');
const { fetchPeers, sendHandshake } = require('../utils/torrent');

async function handleCommand(parameters) {
  const [, , outputFile, inputFile] = parameters;
  const buffer = await readFile(inputFile);
  const torrent = decodeBencode(buffer);
  const addresses = await fetchPeers(torrent);
  const [firstPeer] = addresses[0];

  const response = await sendHandshake(torrent.info, firstPeer);
}

module.exports = handleCommand;
