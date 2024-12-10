const process = require('process');
const handleDecode = require('./commands/decode');
const handleInfo = require('./commands/info');
const handlePeers = require('./commands/peers');
const handleHandshake = require('./commands/handshake');
const handleDownload = require('./commands/download');
const handleMagnetParse = require('./commands/magnet-parse');
const handleMagnetHandshake = require('./commands/magnet-handshake');
const handleMagnetInfo = require('./commands/magnet-info');
const handleMagnetDownload = require('./commands/magnet-download');

const handlers = {
  decode: handleDecode,
  info: handleInfo,
  peers: handlePeers,
  handshake: handleHandshake,
  download_piece: handleDownload,
  download: handleDownload,
  magnet_parse: handleMagnetParse,
  magnet_handshake: handleMagnetHandshake,
  magnet_info: handleMagnetInfo,
  magnet_download_piece: handleMagnetDownload,
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
