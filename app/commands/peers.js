const { readFile } = require('fs/promises');
const { decodeBencode } = require('../utils/decoder');
const { fetchPeers } = require('../utils/torrent');

async function handleCommand(parameters) {
  const [, inputFile] = parameters;
  const buffer = await readFile(inputFile);
  const torrent = decodeBencode(buffer);
  const addresses = await fetchPeers(torrent);

  addresses.forEach((address) => {
    console.log(address);
  });
}

module.exports = handleCommand;
