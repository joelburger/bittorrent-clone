const net = require('net');
const { readFile } = require('fs/promises');
const { decodeBencode } = require('../utils/decoder');
const { calculateInfoHash, generatePeerId } = require('../utils/torrent');
const { createSocket } = require('../utils/network');

async function handshake(infoHashCode, peer, peerId) {
  const [host, port] = peer.split(':');

  console.log(`Sending handshake to ${host}:${port}`);

  return new Promise((resolve, reject) => {
    try {
      const socket = createSocket((data) => {
        const peerId = data.subarray(48, 68).toString('hex');
        socket.end();
        resolve(peerId);
      });

      socket.connect({ host, port: parseInt(port, 10) });

      const buffer = Buffer.alloc(68);
      buffer.writeUInt8(19, 0); // Length of the protocol string
      buffer.write('BitTorrent protocol', 1); // Protocol string
      buffer.fill(0, 20, 28); // Reserved bytes (8 bytes)
      buffer.write(infoHashCode, 28, 'binary'); // Info hash (20 bytes)
      buffer.write(peerId, 48, 'binary'); // Peer ID (20 bytes)
      socket.write(buffer);
    } catch (err) {
      console.error('Handshake error', err);
      reject(err);
    }
  });
}

async function handleCommand(parameters) {
  const [, inputFile, peer] = parameters;

  const buffer = await readFile(inputFile);
  const { info } = decodeBencode(buffer);
  const infoHashCode = calculateInfoHash(info, 'binary');
  const peerId = generatePeerId();
  const response = await handshake(infoHashCode, peer, peerId);
  console.log(`Peer ID: ${response}`);
}

module.exports = handleCommand;
