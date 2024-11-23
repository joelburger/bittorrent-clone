const { fetchPeers, createHandshakeRequest, decodeTorrent } = require('../utils/torrent');
const { readFile } = require('fs/promises');
const { connect, disconnect } = require('../utils/network');
const { writeFileSync } = require('fs');
const { sha1Hash } = require('../utils/encoder');

const DEFAULT_BLOCK_SIZE = 16 * 1024;

const blocks = new Map();
let unchokeReceived = false;
let handshakeReceived = false;

const MessageId = {
  CHOKE: 0,
  UNCHOKE: 1,
  INTERESTED: 2,
  NOT_INTERESTED: 3,
  HAVE: 4,
  BITFIELD: 5,
  REQUEST: 6,
  PIECE: 7,
  CANCEL: 8,
};

let buffer = Buffer.alloc(0); // Empty buffer to store incoming chunks

function dataEventHandler(chunk) {
  console.log(`Response received: ${chunk.length} bytes`);
  buffer = Buffer.concat([buffer, chunk]);

  while (buffer.length >= 4) {
    if (!handshakeReceived) {
      validateHandshakeResponse(buffer);
      handshakeReceived = true;
      buffer = Buffer.alloc(0); // reset buffer
      return;
    }

    const messageLength = buffer.readUInt32BE(0); // Read the 4-byte length prefix
    if (buffer.length < messageLength + 4) break; // Wait for more data

    const message = buffer.slice(4, 4 + messageLength); // Extract complete message
    processPeerMessage(message);

    buffer = buffer.slice(4 + messageLength); // Remove processed message
  }
}

function processPeerMessage(message) {
  const { messageId, payload: blockPayload } = parsePeerMessage(message);

  if (messageId === MessageId.PIECE) {
    const { pieceIndex, blockOffset, block } = parseBlockPayload(blockPayload);

    console.log(`Successfully fetched block. Piece index: ${pieceIndex}, Block offset: '${blockOffset}`);

    blocks.set(`${pieceIndex}-${blockOffset}`, block);
    blockReceived = true;
    return;
  }

  if (messageId === MessageId.UNCHOKE) {
    unchokeReceived = true;
    return;
  }
  console.warn(`Unknown message ID from peer: ${messageId}`);
}

function validateHandshakeResponse(handshakeResponse) {
  if (!handshakeResponse || handshakeResponse.length < 68) {
    throw new Error('Invalid handshake response');
  }

  const protocolLength = handshakeResponse.readUint8(0);
  const protocol = handshakeResponse.subarray(1, protocolLength + 1).toString();

  if (protocol !== 'BitTorrent protocol') {
    throw new Error('Invalid handshake response');
  }
}

async function waitForHandshakeReceived(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const intervalId = setInterval(() => {
      if (handshakeReceived) {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        resolve();
      }
    }, 10);

    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      reject(new Error('Handshake not received within the timeout period'));
    }, timeout);
  });
}

async function waitForUnchokeReceived(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const intervalId = setInterval(() => {
      if (unchokeReceived) {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        resolve();
      }
    }, 10);

    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      reject(new Error('Unchoke not received within the timeout period'));
    }, timeout);
  });
}

async function waitForAllBlocks(totalBlockCount, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const intervalId = setInterval(() => {
      if (blocks.size === totalBlockCount) {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        resolve();
      }
    }, 10);

    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      reject(new Error('Blocks not received within the timeout period'));
    }, timeout);
  });
}

async function performHandshake(socket, torrent) {
  const handshakeRequest = createHandshakeRequest(torrent.info);
  console.log('Sending handshake message');
  socket.write(handshakeRequest);

  await waitForHandshakeReceived();
  console.log('Handshake successful');
}

function sendPeerMessage(socket, messageId, payload) {
  const payloadBuffer = payload ? Buffer.from(payload) : undefined;
  const messageSize = (payload ? payload.length : 0) + 1;
  const buffer = Buffer.alloc(4 + messageSize, 0);

  buffer.writeUInt32BE(messageSize, 0);
  buffer.writeUInt8(messageId, 4);

  if (payloadBuffer) {
    payloadBuffer.copy(buffer, 5);
  }

  socket.write(buffer);
  console.log('sent', buffer);
}

function parsePeerMessage(message) {
  const messageId = message.readUint8(0);
  const payload = message.length > 1 ? message.subarray(1) : null;

  return { messageId, payload };
}

async function sendInterestedMessage(socket) {
  console.log('Sending interested message');
  sendPeerMessage(socket, MessageId.INTERESTED);
  await waitForUnchokeReceived();
  console.log('Unchoke received');
}

function calculateBlockSize(pieceIndex, info, blockOffset) {
  const pieceLength = info['piece length'];
  const numberOfPieces = info.splitPieces.length;
  const totalFileLength = info.length;

  if (pieceIndex + 1 < numberOfPieces) {
    return DEFAULT_BLOCK_SIZE;
  }

  if (blockOffset + DEFAULT_BLOCK_SIZE < pieceLength) {
    return DEFAULT_BLOCK_SIZE;
  }

  return totalFileLength - pieceLength * (numberOfPieces - 1) - blockOffset;
}

function parseBlockPayload(blockPayload) {
  const pieceIndex = blockPayload.readUInt32BE(0);
  const blockOffset = blockPayload.readUInt32BE(4);
  const block = blockPayload.slice(8);

  return { pieceIndex, blockOffset, block };
}

function convertMapToBuffer() {
  // convert the blocks Map which has a key format of 'pieceIndex-blockOffset'.
  // the value of each map entry should be concatenated into a single buffer object/
  // the entries should be sorted in the order of pieceIndex, blockOffset in ascending order

  const sortedBlocks = Array.from(blocks.entries())
    .sort(([a], [b]) => {
      const [pieceIndexA, blockOffsetA] = a.split('-').map(Number);
      const [pieceIndexB, blockOffsetB] = b.split('-').map(Number);
      return pieceIndexA - pieceIndexB || blockOffsetA - blockOffsetB;
    })
    .map(([, block]) => block);

  return Buffer.concat(sortedBlocks);
}

function downloadBlock(socket, torrent, pieceIndex, blockOffset) {
  const blockSize = calculateBlockSize(pieceIndex, torrent.info, blockOffset);
  const payload = Buffer.alloc(12);
  payload.writeUInt32BE(pieceIndex, 0);
  payload.writeUInt32BE(blockOffset, 4);
  payload.writeUInt32BE(blockSize, 8);

  console.log(`Sending message. Piece index ${pieceIndex}, Block offset: ${blockOffset}, Block size: ${blockSize}`);
  sendPeerMessage(socket, MessageId.REQUEST, payload);
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
  const pieceLength = torrent.info['piece length'];
  const pieceArray = [];
  let blockOffset = 0;
  let totalBlockCount = 0;
  let blockRequestsSent = 0;

  while (blockOffset < pieceLength) {
    // limit download requests to 5 at a time
    if (blockRequestsSent - blocks.size > 4) continue;

    downloadBlock(socket, torrent, pieceIndex, blockOffset);
    blockRequestsSent++;

    blockOffset += DEFAULT_BLOCK_SIZE;
    totalBlockCount++;
  }

  await waitForAllBlocks(totalBlockCount);

  return convertMapToBuffer(blocks);
}

async function initialisePeerCommunication(peer, torrent) {
  const startTime = Date.now();
  const socket = await connect(peer.host, peer.port, dataEventHandler);
  await performHandshake(socket, torrent);
  await sendInterestedMessage(socket);
  console.log(`Initialised communication with peer in ${Date.now() - startTime} ms`);
  return socket;
}

async function handleCommand(parameters) {
  const [, , outputFilePath, inputFile, pieceIndexString] = parameters;
  const pieceIndex = Number(pieceIndexString);
  const buffer = await readFile(inputFile);
  const torrent = decodeTorrent(buffer);

  console.log('torrent.info', torrent.info);

  const peers = await fetchPeers(torrent);
  const [firstPeer, secondPeer, thirdPeer] = peers;
  const socket = await initialisePeerCommunication(thirdPeer, torrent);

  try {
    const pieceBuffer = await downloadPiece(socket, pieceIndex, torrent);
    validatePieceHash(pieceBuffer, torrent.info.splitPieces[pieceIndex]);

    console.log(`Download finished. Saving to ${outputFilePath}. Size: ${pieceBuffer.length}`);
    writeFileSync(outputFilePath, Buffer.from(pieceBuffer));
  } catch (err) {
    console.error('Failed to download piece:', err);
  } finally {
    disconnect(socket);
  }
}

module.exports = handleCommand;
