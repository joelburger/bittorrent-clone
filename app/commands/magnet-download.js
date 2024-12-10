const {
  parseMagnetLink,
  fetchMagnetPeers,
  createMagnetHandshakeRequest,
  createExtensionHandshakeRequest,
  createMetadataRequest,
} = require('../utils/magnet');
const { connect, disconnect } = require('../utils/network');
const { decodeBencode } = require('../utils/decoder');
const { isHandshakeResponse, parseHandshake } = require('../utils/handshake');
const {
  calculatePieceLength,
  createBlockRequest,
  BLOCK_REQUEST_SIZE,
  splitPieceHashes,
  createPeerMessage,
  MessageId,
  parseBlockPayload,
} = require('../utils/torrent');
const { sha1Hash } = require('../utils/encoder');
const { writeFileSync } = require('fs');

const MAXIMUM_OUTGOING_BUFFER_SIZE = BLOCK_REQUEST_SIZE * 5; //  maximum of block request messages in the outgoing buffer

const PeerConnectionStatus = Object.freeze({
  PENDING: 'pending',
  HANDSHAKE_RECEIVED: 'handshake received',
  UNCHOKE_RECEIVED: 'unchoke received',
});

const state = {
  blocks: new Map(),
  connectionStatus: PeerConnectionStatus.PENDING,
  incomingBuffer: Buffer.alloc(0),
  outgoingBuffer: Buffer.alloc(0),
  peerMetadataExtensionId: undefined,
  torrent: {
    info: {},
  },
};

function processPeerMessage(message) {
  const messageId = message.readUint8(0);

  if (messageId === MessageId.PIECE) {
    const blockPayload = message.subarray(1);
    const { pieceIndex, blockOffset, block } = parseBlockPayload(blockPayload);

    console.log(
      `Successfully fetched block. Piece index: ${pieceIndex}, Block offset: ${blockOffset}, Block size: ${block.length}`,
    );

    state.blocks.set(`${pieceIndex}-${blockOffset}`, block);
    return;
  }

  if (messageId === MessageId.UNCHOKE) {
    state.connectionStatus = PeerConnectionStatus.UNCHOKE_RECEIVED;
    return;
  }

  if (messageId === 20) {
    const payload = message.subarray(1);
    const dictionary = payload.subarray(1);
    const decoded = decodeBencode(dictionary);

    if (decoded.hasOwnProperty('m')) {
      state.peerMetadataExtensionId = decoded.m['ut_metadata'];
      console.log(`Peer Metadata Extension ID: ${state.peerMetadataExtensionId}`);
    } else if (decoded.hasOwnProperty('msg_type')) {
      const { msg_type, piece, total_size } = decoded;
      console.log({ msg_type, piece, total_size });

      const metadataPiece = decodeBencode(message.subarray(message.length - total_size));
      console.log(metadataPiece, JSON.stringify(metadataPiece));

      const splitPieces = splitPieceHashes(metadataPiece.pieces);

      state.torrent.info = {
        length: metadataPiece.length,
        'piece length': metadataPiece['piece length'],
        splitPieces,
        pieces: metadataPiece.pieces,
      };

      console.log(`Peer Metadata Extension ID: ${state.peerMetadataExtensionId}`);
    }
  }
}

function dataEventHandler(chunk) {
  console.log(`Response received: ${chunk.length} bytes`);
  state.incomingBuffer = Buffer.concat([state.incomingBuffer, chunk]);

  while (state.incomingBuffer.length >= 4) {
    if (isHandshakeResponse(state.incomingBuffer)) {
      const { supportsExtension, peerId } = parseHandshake(state.incomingBuffer);

      console.log(`Peer ID: ${peerId}`);
      state.incomingBuffer = state.incomingBuffer.slice(68);
      state.connectionStatus = PeerConnectionStatus.HANDSHAKE_RECEIVED;
      continue;
    }

    const messageLength = state.incomingBuffer.readUInt32BE(0);
    if (state.incomingBuffer.length < messageLength + 4) break;

    const message = state.incomingBuffer.slice(4, 4 + messageLength);
    processPeerMessage(message);
    state.incomingBuffer = state.incomingBuffer.slice(4 + messageLength);
  }
}

async function waitForHandshakeReceived() {
  return new Promise((resolve) => {
    const intervalId = setInterval(() => {
      if (state.connectionStatus === PeerConnectionStatus.HANDSHAKE_RECEIVED) {
        clearInterval(intervalId);
        resolve();
      }
    }, 1000);
  });
}

function flushOutgoingBuffer(socket) {
  console.log(`Sending ${state.outgoingBuffer.length / BLOCK_REQUEST_SIZE} request messages to peer`);
  socket.write(state.outgoingBuffer);
  state.outgoingBuffer = Buffer.alloc(0);
}

async function downloadPiece(socket, pieceIndex) {
  let blockOffset = 0;
  let totalBlockCount = 0;

  const calculatedPieceLength = calculatePieceLength(pieceIndex, state.torrent.info);

  state.outgoingBuffer = Buffer.alloc(0);
  while (blockOffset < calculatedPieceLength) {
    const { blockSize, peerMessage } = createBlockRequest(
      state.torrent,
      pieceIndex,
      calculatedPieceLength,
      blockOffset,
    );
    console.log(
      `\x1b[32mAdding block request to outgoing buffer. Piece index ${pieceIndex}, Block offset: ${blockOffset}, Block size: ${blockSize}\x1b[0m`,
    );

    state.outgoingBuffer = Buffer.concat([state.outgoingBuffer, peerMessage]);

    blockOffset += blockSize;
    totalBlockCount++;

    if (state.outgoingBuffer.length >= MAXIMUM_OUTGOING_BUFFER_SIZE && state.incomingBuffer.length === 0) {
      flushOutgoingBuffer(socket);
    }
  }

  // flush any remaining messages in buffer
  if (state.outgoingBuffer.length > 0 && state.incomingBuffer.length === 0) {
    console.log('Flushing remaining outgoing buffer');
    flushOutgoingBuffer(socket);
  }

  await waitForAllBlocks(totalBlockCount);

  return convertMapToBuffer(state.blocks);
}

function convertMapToBuffer() {
  const sortedBlocks = Array.from(state.blocks.entries())
    .sort(([a], [b]) => {
      const [pieceIndexA, blockOffsetA] = a.split('-').map(Number);
      const [pieceIndexB, blockOffsetB] = b.split('-').map(Number);
      return pieceIndexA - pieceIndexB || blockOffsetA - blockOffsetB;
    })
    .map(([, block]) => block);

  return Buffer.concat(sortedBlocks);
}

async function waitForAllBlocks(totalBlockCount, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let timeoutId, intervalId;
    timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      reject(new Error('Blocks not received within the timeout period'));
    }, timeout);

    intervalId = setInterval(() => {
      if (state.blocks.size === totalBlockCount) {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        resolve();
      }
    }, 1);
  });
}

async function waitForPeerMetadataExtensionId() {
  return new Promise((resolve) => {
    const intervalId = setInterval(() => {
      if (state.peerMetadataExtensionId) {
        clearInterval(intervalId);
        resolve();
      }
    }, 1000);
  });
}

async function waitForMetadataResponse() {
  return new Promise((resolve) => {
    const intervalId = setInterval(() => {
      if (state.torrent.info) {
        clearInterval(intervalId);
        resolve();
      }
    }, 1000);
  });
}

async function sendInterestedMessage(socket) {
  console.log('Sending interested message');
  const peerMessage = createPeerMessage(MessageId.INTERESTED);
  socket.write(peerMessage);
  await waitForConnectionStatus(PeerConnectionStatus.UNCHOKE_RECEIVED);
  console.log('Unchoke received');
}

async function waitForConnectionStatus(expectedConnectionStatus, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let timeoutId;
    const intervalId = setInterval(() => {
      if (state.connectionStatus === expectedConnectionStatus) {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        resolve();
      }
    }, 1);

    timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      reject(new Error(`Timeout while waiting for connection status of ${expectedConnectionStatus}`));
    }, timeout);
  });
}

function validatePieceHash(pieceBuffer, expectedPieceHash) {
  const actualPieceHash = sha1Hash(pieceBuffer, 'hex');
  const expectedPieceHashInHex = Buffer.from(expectedPieceHash).toString('hex');

  if (expectedPieceHashInHex === actualPieceHash) {
    console.log('Piece hash is valid');
    return;
  }

  throw new Error(
    `Invalid piece hash. Size: ${pieceBuffer.length}, Expected: ${expectedPieceHashInHex}, Actual: ${actualPieceHash}`,
  );
}

async function handleCommand(parameters) {
  const [command, , outputFilePath, magnetLink, pieceIndexString] = parameters;
  const pieceIndex = Number(pieceIndexString);
  const { infoHash, trackerUrl } = parseMagnetLink(magnetLink);

  state.torrent.info_hash = infoHash;
  state.torrent.announce = trackerUrl;

  const peers = await fetchMagnetPeers(infoHash, trackerUrl);
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

    const metadataRequest = createMetadataRequest(state.peerMetadataExtensionId, 0);
    socket.write(metadataRequest);

    await waitForMetadataResponse();

    await sendInterestedMessage(socket);

    const pieceBuffer = await downloadPiece(socket, pieceIndex);
    validatePieceHash(pieceBuffer, state.torrent.info.splitPieces[pieceIndex]);

    console.log(`Download finished. Saving to ${outputFilePath}. Size: ${pieceBuffer.length}`);
    writeFileSync(outputFilePath, Buffer.from(pieceBuffer));
  } catch (err) {
    console.error('Fatal error', err);
  } finally {
    disconnect(socket);
  }
}

module.exports = handleCommand;
