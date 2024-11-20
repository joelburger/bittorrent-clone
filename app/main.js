const process = require('process');
const handleDecode = require('./commands/decode');
const handleInfo = require('./commands/info');
const handlePeers = require('./commands/peers');
const handleHandshake = require('./commands/handshake');
const handleDownloadPiece = require('./commands/download');

const handlers = {
  decode: handleDecode,
  info: handleInfo,
  peers: handlePeers,
  handshake: handleHandshake,
  download_piece: handleDownloadPiece,
};

const parameters = process.argv.slice(2);
const [command] = parameters;

const handler = handlers[command];

if (!handler) {
  throw new Error(`Unknown command ${command}`);
}

try {
  handler(parameters);
} catch (err) {
  console.error('Fatal error', err);
}
