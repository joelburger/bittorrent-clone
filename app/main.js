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

async function main() {
  const command = process.argv[2];
  if (command === 'decode') {
    const bencodedValue = process.argv[3];
    console.log(JSON.stringify(decodeBencode(bencodedValue)));
  } else if (command === 'info') {
    const inputFile = process.argv[3];
    const buffer = await readFile(inputFile);
    const decoded = decodeBencode(buffer);
    console.log(`Tracker URL: ${decoded.announce.toString()}`);
    console.log(`Length: ${decoded.info.length}`);
    console.log(`Info Hash: ${calculateInfoHash(buffer)}`);
  } else {
    throw new Error(`Unknown command ${command}`);
  }
}

main();
