const process = require('process');
const util = require('util');

// Examples:
// - decodeBencode("5:hello") -> "hello"
// - decodeBencode("10:hello12345") -> "hello12345"
function decodeBencode(bencodedValue) {
  // Check if the first character is a digit
  if (!isNaN(bencodedValue[0])) {
    const firstColonIndex = bencodedValue.indexOf(':');
    if (firstColonIndex === -1) {
      throw new Error('Invalid encoded value');
    }
    return bencodedValue.substr(firstColonIndex + 1);
  } else {
    throw new Error('Only strings are supported at the moment');
  }
}

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
