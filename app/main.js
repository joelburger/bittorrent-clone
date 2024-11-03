const process = require('process');
const handleDecode = require('./commands/decode');
const handleInfo = require('./commands/info');
const handlePeers = require('./commands/peers');

async function main() {
  const parameters = process.argv.slice(2);
  const [command] = parameters;

  if (command === 'decode') {
    handleDecode(parameters);
  } else if (command === 'info') {
    await handleInfo(parameters);
  } else if (command === 'peers') {
    await handlePeers(parameters);
  } else {
    throw new Error(`Unknown command ${command}`);
  }
}

main();
