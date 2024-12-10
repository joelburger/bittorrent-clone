const {
  parseMagnetLink,
  fetchMagnetPeers,
  createMagnetHandshakeRequest,
  createExtensionHandshakeRequest,
  createMetadataRequest,
} = require('../utils/magnet');
const { connect, disconnect } = require('../utils/network');
const { decodeBencode } = require('../utils/decoder');
const { splitPieceHashes } = require('../utils/torrent');
const { parseHandshake, isHandshakeResponse } = require('../utils/handshake');

let incomingBuffer = Buffer.alloc(0);
let handshakeReceived = false;
let peerMetadataExtensionId;
let torrent = {};

function processPeerMessage(message) {
  const messageId = message.readUint8(0);

  console.log('messageId', messageId);
  console.log('message', message.length);

  if (messageId === 20) {
    const payload = message.subarray(1);
    const dictionary = payload.subarray(1);
    const decoded = decodeBencode(dictionary);

    if (decoded.hasOwnProperty('m')) {
      peerMetadataExtensionId = decoded.m['ut_metadata'];
      console.log(`Peer Metadata Extension ID: ${peerMetadataExtensionId}`);
    } else if (decoded.hasOwnProperty('msg_type')) {
      const { msg_type, piece, total_size } = decoded;
      console.log({ msg_type, piece, total_size });

      const metadataPiece = decodeBencode(message.subarray(message.length - total_size));
      console.log(metadataPiece, JSON.stringify(metadataPiece));

      const pieces = splitPieceHashes(metadataPiece.pieces);

      torrent.info = {
        length: metadataPiece.length,
        pieceLength: metadataPiece['piece length'],
        pieces,
      };
    } else {
      console.log('decoded', decoded);
    }
  }
}

function dataEventHandler(chunk) {
  console.log(`Response received: ${chunk.length} bytes`);
  incomingBuffer = Buffer.concat([incomingBuffer, chunk]);

  while (incomingBuffer.length >= 4) {
    if (isHandshakeResponse(incomingBuffer)) {
      const { supportsExtension, peerId } = parseHandshake(incomingBuffer);

      console.log(`Peer ID: ${peerId}`);
      incomingBuffer = incomingBuffer.slice(68);
      handshakeReceived = true;
      continue;
    }

    const messageLength = incomingBuffer.readUInt32BE(0);

    if (incomingBuffer.length < messageLength + 4) break;
    const message = incomingBuffer.slice(4, 4 + messageLength);
    processPeerMessage(message);
    incomingBuffer = incomingBuffer.slice(4 + messageLength);
  }
}

async function waitForHandshakeReceived() {
  return new Promise((resolve) => {
    const intervalId = setInterval(() => {
      if (handshakeReceived) {
        clearInterval(intervalId);
        resolve();
      }
    }, 1000);
  });
}

async function waitForPeerMetadataExtensionId() {
  return new Promise((resolve) => {
    const intervalId = setInterval(() => {
      if (peerMetadataExtensionId) {
        clearInterval(intervalId);
        resolve();
      }
    }, 1000);
  });
}

async function waitForMetadataResponse() {
  return new Promise((resolve) => {
    const intervalId = setInterval(() => {
      if (torrent.info) {
        clearInterval(intervalId);
        resolve();
      }
    }, 1000);
  });
}

async function handleCommand(parameters) {
  // Parse the magnet link to get the tracker URL
  // Perform the tracker GET request to get a list of peers
  // Establish a TCP connection with a peer, and perform a handshake
  // Perform the base handshake
  // Send the bitfield message (can be ignored in this challenge)
  // Receive the bitfield message
  // Perform the extension handshake

  // Send the metadata request message (This stage)
  // Receive the metadata message (later stages)
  // Print out the data received, as per the format above.

  const [, magnetLink] = parameters;
  const { infoHash, trackerUrl } = parseMagnetLink(magnetLink);
  const peers = await fetchMagnetPeers(infoHash, trackerUrl);

  torrent.announce = trackerUrl;
  torrent.info_hash = infoHash;

  const [peer] = peers;
  let socket;
  try {
    socket = await connect(peer.host, peer.port, dataEventHandler);

    const handshakeRequest = createMagnetHandshakeRequest(infoHash);
    socket.write(handshakeRequest);

    await waitForHandshakeReceived();

    const extensionHandshakeRequest = createExtensionHandshakeRequest(1);
    socket.write(extensionHandshakeRequest);

    await waitForPeerMetadataExtensionId();

    const metadataRequest = createMetadataRequest(peerMetadataExtensionId, 0);
    socket.write(metadataRequest);

    await waitForMetadataResponse();

    console.log(`Tracker URL: ${torrent.announce}`);
    console.log(`Length: ${torrent.info.length}`);
    console.log(`Info Hash: ${torrent.info_hash}`);
    console.log(`Piece Length: ${torrent.info.pieceLength}`);
    console.log('Piece hashes:');
    torrent.info.pieces.forEach((piece) => console.log(piece.toString('hex')));

    socket.destroySoon();
  } catch (err) {
    console.error('Handshake failed', err);
  } finally {
    disconnect(socket);
  }
}

module.exports = handleCommand;
