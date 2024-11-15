const { readFile } = require('fs/promises');
const { decodeBencode } = require('../utils/decoder');
const { calculateInfoHash } = require('../utils/torrent');

async function handleCommand(parameters) {
  const [, inputFile] = parameters;
  const buffer = await readFile(inputFile);
  const torrent = decodeBencode(buffer);
  console.log(`Tracker URL: ${torrent.announce.toString()}`);
  console.log(`Length: ${torrent.info.length}`);
  console.log(`Info Hash: ${calculateInfoHash(torrent.info)}`);
  console.log(`Piece Length: ${torrent.info['piece length']}`);
  console.log('Piece Hashes:');

  splitPieces(torrent.info.pieces).forEach((piece) => {
    console.log(piece.toString('hex'));
  });
}

module.exports = handleCommand;
