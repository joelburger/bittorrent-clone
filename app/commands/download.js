const {
  fetchPeers,
  createHandshakeRequest,
  decodeTorrent,
  createPeerMessage,
  MessageId,
  parsePeerMessage,
  parseBlockPayload,
  createBlockRequest,
  calculatePieceLength,
  BLOCK_REQUEST_SIZE,
} = require('../utils/torrent');
const { readFile } = require('fs/promises');
const { connect, disconnect } = require('../utils/network');
const { writeFileSync } = require('fs');
const { sha1Hash } = require('../utils/encoder');

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
};

function dataEventHandler(chunk) {
  console.log(`Response received: ${chunk.length} bytes`);
  state.incomingBuffer = Buffer.concat([state.incomingBuffer, chunk]);

  while (state.incomingBuffer.length >= 4) {
    if (isHandshakeResponse(state.incomingBuffer)) {
      state.connectionStatus = PeerConnectionStatus.HANDSHAKE_RECEIVED;
      state.incomingBuffer = Buffer.alloc(0); // reset buffer
      return;
    }

    const messageLength = state.incomingBuffer.readUInt32BE(0); // Read the 4-byte length prefix
    if (state.incomingBuffer.length < messageLength + 4) break; // Wait for more data

    const message = state.incomingBuffer.slice(4, 4 + messageLength); // Extract complete message
    processPeerMessage(message);

    state.incomingBuffer = state.incomingBuffer.slice(4 + messageLength); // Remove processed message
  }
}

function processPeerMessage(message) {
  const { messageId, payload: blockPayload } = parsePeerMessage(message);

  if (messageId === MessageId.PIECE) {
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
  console.warn(`Unknown message ID from peer: ${messageId}`);
}

function isHandshakeResponse(handshakeResponse) {
  if (!handshakeResponse || handshakeResponse.length < 68) {
    return false;
  }

  const protocolLength = handshakeResponse.readUint8(0);
  const protocol = handshakeResponse.subarray(1, protocolLength + 1).toString();

  return protocol === 'BitTorrent protocol';
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

async function performHandshake(socket, torrent) {
  const handshakeRequest = createHandshakeRequest(torrent.info);
  console.log('Sending handshake message');
  socket.write(handshakeRequest);
  await waitForConnectionStatus(PeerConnectionStatus.HANDSHAKE_RECEIVED);
  console.log('Handshake successful');
}

async function sendInterestedMessage(socket) {
  console.log('Sending interested message');
  const peerMessage = createPeerMessage(MessageId.INTERESTED);
  socket.write(peerMessage);
  await waitForConnectionStatus(PeerConnectionStatus.UNCHOKE_RECEIVED);
  console.log('Unchoke received');
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

async function downloadPiece(socket, pieceIndex, torrent) {
  let blockOffset = 0;
  let totalBlockCount = 0;

  const calculatedPieceLength = calculatePieceLength(pieceIndex, torrent.info);

  state.outgoingBuffer = Buffer.alloc(0);
  while (blockOffset < calculatedPieceLength) {
    const { blockSize, peerMessage } = createBlockRequest(torrent, pieceIndex, calculatedPieceLength, blockOffset);
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

function flushOutgoingBuffer(socket) {
  console.log(`Sending ${state.outgoingBuffer.length / BLOCK_REQUEST_SIZE} request messages to peer`);
  socket.write(state.outgoingBuffer);
  state.outgoingBuffer = Buffer.alloc(0);
}

async function initialisePeerCommunication(peer, torrent) {
  const startTime = Date.now();
  const socket = await connect(peer.host, peer.port, dataEventHandler);
  await performHandshake(socket, torrent);
  await sendInterestedMessage(socket);
  console.log(`Initialised communication with peer in ${Date.now() - startTime} ms`);
  return socket;
}

function handleDownloadPiece(socket, pieceIndex, torrent) {}

async function handleCommand(parameters) {
  const [, command, outputFilePath, inputFile, pieceIndexString] = parameters;

  const pieceIndex = pieceIndexString ? Number(pieceIndexString) : null;
  const buffer = await readFile(inputFile);
  const torrent = decodeTorrent(buffer);
  const peers = await fetchPeers(torrent);

  let workQueue;
  if (command === 'download') {
    workQueue = Array.from({ length: torrent.info.splitPieces.length }, (_, index) => index);
  } else {
    workQueue = [pieceIndex];
  }

  const socket = await initialisePeerCommunication(peers[0], torrent);
  try {
    let fileBuffer = Buffer.alloc(0);
    for (const pieceIndex of workQueue) {
      const pieceBuffer = await downloadPiece(socket, pieceIndex, torrent);
      validatePieceHash(pieceBuffer, torrent.info.splitPieces[pieceIndex]);
      fileBuffer = Buffer.concat([fileBuffer, pieceBuffer]);
    }

    console.log(`Download finished. Saving to ${outputFilePath}. Size: ${fileBuffer.length}`);
    writeFileSync(outputFilePath, Buffer.from(fileBuffer));
  } catch (err) {
    console.error('Failed to download file:', err);
  } finally {
    disconnect(socket);
  }
}

module.exports = handleCommand;
