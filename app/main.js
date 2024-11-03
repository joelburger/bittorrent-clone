const process = require('process');
const { readFile } = require('fs/promises');
const crypto = require('crypto');
const fs = require('fs');
const { decodeBencode } = require('./decoder');

const HASH_LENGTH = 20;

function sha1Hash(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function calculateInfoHash(info, hashLength) {
  const numberOfPieces = info.pieces.length / hashLength;
  const buffer = Buffer.concat([
    Buffer.from(
      `d6:lengthi${info.length}e4:name${info.name.length}:${info.name}12:piece lengthi${info['piece length']}e6:pieces${numberOfPieces * hashLength}:`,
    ),
    info.pieces,
    Buffer.from('e'),
  ]);

  return sha1Hash(buffer);
}

function splitPieces(pieces, hashLength) {
  const result = [];
  for (let i = 0; i < pieces.length; i += hashLength) {
    result.push(pieces.subarray(i, i + hashLength));
  }
  return result;
}

function convertBuffersToStrings(obj) {
  if (Buffer.isBuffer(obj)) {
    return obj.toString();
  } else if (Array.isArray(obj)) {
    return obj.map(convertBuffersToStrings);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, convertBuffersToStrings(value)]));
  }
  return obj;
}

async function main() {
  const command = process.argv[2];

  if (command === 'decode') {
    const buffer = Buffer.from(process.argv[3]);
    const result = decodeBencode(buffer);
    console.log(JSON.stringify(convertBuffersToStrings(result)));
  } else if (command === 'info') {
    const inputFile = process.argv[3];
    const buffer = await readFile(inputFile);
    const decoded = decodeBencode(buffer);
    console.log(`Tracker URL: ${decoded.announce.toString()}`);
    console.log(`Length: ${decoded.info.length}`);
    console.log(`Info Hash: ${calculateInfoHash(decoded.info, HASH_LENGTH)}`);
    console.log(`Piece Length: ${decoded.info['piece length']}`);
    console.log('Piece Hashes:');

    splitPieces(decoded.info.pieces, HASH_LENGTH).forEach((piece) => {
      console.log(piece.toString('hex'));
    });
  } else {
    throw new Error(`Unknown command ${command}`);
  }
}

main();
