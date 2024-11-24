const { readFile } = require('fs/promises');
const { decodeBencode } = require('../utils/decoder');
const { fetchPeers } = require('../utils/torrent');

async function handleCommand(parameters) {
  const [, inputFile] = parameters;
  const buffer = await readFile(inputFile);
  const torrent = decodeBencode(buffer);
  const peers = await fetchPeers(torrent);

  peers.forEach(({ host, port }) => {
    console.log(`${host}:${port}`);
  });
}

module.exports = handleCommand;
