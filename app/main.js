const process = require('process');
const util = require('util');

function main() {
  const command = process.argv[2];
  if (command === 'decode') {
    const bencodedValue = process.argv[3];
    console.log(JSON.stringify(decodeBencode(bencodedValue)));
  } else {
    throw new Error(`Unknown command ${command}`);
  }
}

main();
