const process = require('process');
const handleDecode = require('./commands/decode');
const handleInfo = require('./commands/info');
const handlePeers = require('./commands/peers');
const handleHandshake = require('./commands/handshake');
const handleDownload = require('./commands/download');
const handleMagnetParse = require('./commands/magnet-parse');
const handleMagnetInfo = require('./commands/magnet-info');
const handleMagnetDownload = require('./commands/magnet-download');
const MagnetHandshake = require('./commands/magnet-handshake');
const MagnetInfo = require('./commands/magnet-info');
const MagnetDownload = require('./commands/magnet-download');

const handlers = {
  decode: handleDecode,
  info: handleInfo,
  peers: handlePeers,
  handshake: handleHandshake,
  download_piece: handleDownload,
  download: handleDownload,
  magnet_parse: handleMagnetParse,
};

const parameters = process.argv.slice(2);
const [command] = parameters;

if (command === 'magnet_handshake') {
  const magnetHandshake = new MagnetHandshake();
  magnetHandshake.handleCommand(parameters);
} else if (command === 'magnet_info') {
  const magnetInfo = new MagnetInfo();
  magnetInfo.handleCommand(parameters);
} else if (command === 'magnet_download' || command === 'magnet_download_piece') {
  const magnetDownload = new MagnetDownload();
  magnetDownload.handleCommand(parameters);
} else {
  const handler = handlers[command];

  if (!handler) {
    throw new Error(`Unknown command ${command}`);
  }

  try {
    handler(parameters);
  } catch (err) {
    console.error('Fatal error', err);
  }
}
