const process = require('process');
const util = require('util');
const fs = require('fs');
const { decodeBencode } = require('./decoder');

function main() {
  const command = process.argv[2];
  if (command === 'decode') {
    const bencodedValue = process.argv[3];
    console.log(JSON.stringify(decodeBencode(bencodedValue)));
  } else if (command === 'info') {
    const inputFile = process.argv[3];
    const bencodedValue = fs.readFileSync(inputFile, 'utf8');
    const decoded = decodeBencode(bencodedValue);
    console.log(`Tracker URL: ${decoded.announce}`);
    console.log(`Length: ${decoded.info.length}`);
  } else {
    throw new Error(`Unknown command ${command}`);
  }
}

main();
