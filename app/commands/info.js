const { readFile } = require('fs/promises');
const { decodeBencode } = require('../decoder');
const { calculateInfoHash } = require('./common');

const PIECES_LENGTH = 20;

function splitPieces(pieces) {
  const result = [];
  for (let i = 0; i < pieces.length; i += PIECES_LENGTH) {
    result.push(pieces.subarray(i, i + PIECES_LENGTH));
  }
  return result;
}

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
