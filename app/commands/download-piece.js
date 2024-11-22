const { fetchPeers, createHandshakeRequest, decodeTorrent } = require('../utils/torrent');
const { readFile } = require('fs/promises');
const { connect, disconnect } = require('../utils/network');
const { writeFileSync } = require('fs');
const { sha1Hash } = require('../utils/encoder');

const DEFAULT_BLOCK_SIZE = 16 * 1024;

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

const connectionState = {
  data: [],
};

function dataEventHandler(data) {
  console.log(`Response received: ${data.length} bytes`);
  connectionState.data.push(data);
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

function fetchResponse(expectedResponseSize) {
  return new Promise((resolve, reject) => {
    const intervalId = setInterval(() => {
      const concatenatedData = Buffer.concat(connectionState.data);
      if (concatenatedData.length >= expectedResponseSize) {
        clearInterval(intervalId);
        connectionState.data = [];
        resolve(concatenatedData);
      }
    }, 10);
  });
}

async function performHandshake(socket, torrent) {
  const handshakeRequest = createHandshakeRequest(torrent.info);
  console.log('Sending handshake message');
  socket.write(handshakeRequest);

  const response = await fetchResponse(handshakeRequest.length);
  validateHandshakeResponse(response);
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
}

function parsePeerMessageResponse(response) {
  const messageSize = response.readUInt32BE(0);
  const messageId = response.readUint8(4);
  const payload = response.length > 5 ? response.subarray(5) : null;

  return { messageId, messageSize, payload };
}

async function sendInterestedMessage(socket) {
  console.log('Sending interested message');
  await sendPeerMessage(socket, MessageId.INTERESTED);
  const response = await fetchResponse(5);
  const { messageId } = parsePeerMessageResponse(response);
  if (messageId !== MessageId.UNCHOKE) {
    throw new Error('Unchoke not received');
  }
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

function parseBlockPayload(expectedPieceIndex, expectedBlockOffset, expectedBlockSize, blockPayload) {
  const actualPieceIndex = blockPayload.readUInt32BE(0);
  const actualBlockOffset = blockPayload.readUInt32BE(4);

  if (actualPieceIndex !== expectedPieceIndex || actualBlockOffset !== expectedBlockOffset) {
    throw new Error('Invalid block payload. Piece index or offset is incorrect.');
  }

  const block = blockPayload.slice(8);

  if (block.length !== expectedBlockSize) {
    throw new Error('Invalid block length');
  }

  return block;
}

async function downloadBlock(socket, torrent, pieceIndex, blockOffset) {
  const blockSize = calculateBlockSize(pieceIndex, torrent.info, blockOffset);
  const payload = Buffer.alloc(12);
  payload.writeUInt32BE(pieceIndex, 0);
  payload.writeUInt32BE(blockOffset, 4);
  payload.writeUInt32BE(blockSize, 8);
  console.log(`Sending message. Piece index ${pieceIndex}, Block offset: ${blockOffset}, Block size: ${blockSize}`);
  sendPeerMessage(socket, MessageId.REQUEST, payload);
  const response = await fetchResponse(blockSize);
  const { messageId, payload: blockPayload } = parsePeerMessageResponse(response);
  if (messageId !== MessageId.PIECE) {
    throw new Error(`Invalid download response: ${messageId}`);
  }

  return parseBlockPayload(pieceIndex, blockOffset, blockSize, blockPayload);
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

  while (blockOffset < pieceLength) {
    const startTime = Date.now();
    const block = await downloadBlock(socket, torrent, pieceIndex, blockOffset);
    console.log(
      `Piece ${pieceIndex}, Offset ${blockOffset}, Block size: ${block.length} successfully fetched in ${Date.now() - startTime} ms`,
    );
    pieceArray.push(...block);
    blockOffset += DEFAULT_BLOCK_SIZE;
  }

  const pieceBuffer = Buffer.from(pieceArray);
  validatePieceHash(pieceBuffer, torrent.info.splitPieces[pieceIndex]);

  return Buffer.from(pieceBuffer);
}

async function initialiseSocket(peer, torrent) {
  const startTime = Date.now();
  const socket = await connect(peer.host, peer.port, dataEventHandler);
  await performHandshake(socket, torrent);
  await sendInterestedMessage(socket);
  console.log(`Connected to peer in ${Date.now() - startTime} ms`);
  return socket;
}

async function handleCommand(parameters) {
  const [, , outputFilePath, inputFile, pieceIndexString] = parameters;
  const pieceIndex = Number(pieceIndexString);
  const buffer = await readFile(inputFile);
  const torrent = decodeTorrent(buffer);

  console.log('torrent.info', torrent.info);

  const peers = await fetchPeers(torrent);
  const [firstPeer, secondPeer] = peers;
  const socket = await initialiseSocket(secondPeer, torrent);

  try {
    const pieceBuffer = await downloadPiece(socket, pieceIndex, torrent);

    console.log(`Download finished. Saving to ${outputFilePath}. Size: ${pieceBuffer.length}`);
    writeFileSync(outputFilePath, Buffer.from(pieceBuffer));
  } catch (err) {
    console.error('Failed to download piece:', err);
  } finally {
    disconnect(socket);
  }
}

module.exports = handleCommand;
