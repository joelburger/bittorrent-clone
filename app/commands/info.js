const { readFile } = require('fs/promises');
const { decodeBencode } = require('../decoder');
const { HASH_LENGTH, calculateInfoHash } = require('../common');

function splitPieces(pieces, hashLength) {
  const result = [];
  for (let i = 0; i < pieces.length; i += hashLength) {
    result.push(pieces.subarray(i, i + hashLength));
  }
  return result;
}

async function handleCommand(parameters) {
  const [, inputFile] = parameters;
  const buffer = await readFile(inputFile);
  const torrent = decodeBencode(buffer);
  console.log(`Tracker URL: ${torrent.announce.toString()}`);
  console.log(`Length: ${torrent.info.length}`);
  console.log(`Info Hash: ${calculateInfoHash(torrent.info, HASH_LENGTH)}`);
  console.log(`Piece Length: ${torrent.info['piece length']}`);
  console.log('Piece Hashes:');

  splitPieces(torrent.info.pieces, HASH_LENGTH).forEach((piece) => {
    console.log(piece.toString('hex'));
  });
}

module.exports = handleCommand;
