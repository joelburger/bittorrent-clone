const process = require('process');
const { readFile } = require('fs/promises');
const crypto = require('crypto');
const fs = require('fs');
const { decodeBencode } = require('./decoder');

function sha1Hash(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function calculateInfoHash(buffer) {
  const cursor = buffer.indexOf('info');
  const info = buffer.subarray(cursor + 4, buffer.length - 1);

  return sha1Hash(info);
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
    console.log(`Info Hash: ${calculateInfoHash(buffer)}`);
    console.log(`Piece Length: ${decoded.info['piece length']}`);
    console.log('Piece Hashes:');

    splitPieces(decoded.info.pieces, 20).forEach((piece) => {
      console.log(piece.toString('hex'));
    });
  } else {
    throw new Error(`Unknown command ${command}`);
  }
}

main();
