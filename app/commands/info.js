const { readFile } = require('fs/promises');
const { calculateInfoHash, decodeTorrent } = require('../utils/torrent');

async function handleCommand(parameters) {
  const [, inputFile] = parameters;
  const buffer = await readFile(inputFile);
  const torrent = decodeTorrent(buffer);
  console.log(`Tracker URL: ${torrent.announce.toString()}`);
  console.log(`Length: ${torrent.info.length}`);
  console.log(`Info Hash: ${calculateInfoHash(torrent.info)}`);
  console.log(`Piece Length: ${torrent.info['piece length']}`);
  console.log('Piece Hashes:');
  torrent.info.splitPieces.forEach((piece) => console.log(piece.toString('hex')));
}

module.exports = handleCommand;
