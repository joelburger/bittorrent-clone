const { readFile } = require('fs/promises');
const { decodeBencode } = require('../utils/decoder');
const { sendHandshake } = require('../utils/torrent');

async function handleCommand(parameters) {
  const [, inputFile, peer] = parameters;

  const buffer = await readFile(inputFile);
  const { info } = decodeBencode(buffer);
  const response = await sendHandshake(info, peer);
  console.log(`Peer ID: ${response}`);
}

module.exports = handleCommand;
