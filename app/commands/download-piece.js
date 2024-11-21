const { decodeBencode } = require('../utils/decoder');
const { fetchPeers, createHandshakeRequest, splitPieces } = require('../utils/torrent');
const { readFile } = require('fs/promises');
const { connect, disconnect } = require('../utils/network');
const { writeFileSync } = require('fs');

const DEFAULT_BLOCK_SIZE = 16 * 1024;

const Status = {
  WAITING_ON_RESPONSE: 'waiting',
  RESPONSE_RECEIVED: 'response-received',
};

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
  status: undefined,
  data: [],
};

function dataEventHandler(data) {
  console.log(`Response received: ${data.length} bytes`);
  connectionState.status = Status.RESPONSE_RECEIVED;
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

function fetchResponse() {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      clearTimeout(timeoutId);
      reject(new Error('Request timeout'));
    }, 5000);

    const intervalId = setInterval(() => {
      if (connectionState.status === Status.RESPONSE_RECEIVED) {
        clearInterval(intervalId);
        resolve(Buffer.concat(connectionState.data));
        connectionState.data = [];
      }
    }, 900);
  });
}

async function performHandshake(socket, torrent) {
  socket.write(createHandshakeRequest(torrent.info));
  connectionState.status = Status.WAITING_ON_RESPONSE;

  const response = await fetchResponse();
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
  connectionState.status = Status.WAITING_ON_RESPONSE;
}

function parsePeerMessageResponse(response) {
  const messageSize = response.readUInt32BE(0);
  const messageId = response.readUint8(4);
  const payload = response.length > 5 ? response.subarray(5) : null;

  return { messageId, messageSize, payload };
}

async function sendInterestedMessage(socket) {
  await sendPeerMessage(socket, MessageId.INTERESTED);
  const response = await fetchResponse();
  const { messageId } = parsePeerMessageResponse(response);
  if (messageId !== MessageId.UNCHOKE) {
    throw new Error('Unchoke not received');
  }
  console.log('Unchoke received');
}

function calculateBlockSize(pieceIndex, info, blockOffset) {
  const pieceLength = info['piece length'];
  const numberOfPieces = splitPieces(info.pieces).length;
  const totalFileLength = info.length;

  if (pieceIndex + 1 < numberOfPieces) {
    return DEFAULT_BLOCK_SIZE;
  }

  if (blockOffset + DEFAULT_BLOCK_SIZE < pieceLength) {
    return DEFAULT_BLOCK_SIZE;
  }

  return pieceLength * numberOfPieces - totalFileLength;
}

async function downloadBlock(socket, torrent, pieceIndex, blockOffset) {
  const blockSize = calculateBlockSize(pieceIndex, torrent.info, blockOffset);
  const payload = Buffer.alloc(12);
  payload.writeUInt32BE(pieceIndex, 0);
  payload.writeUInt32BE(blockOffset, 4);
  payload.writeUInt32BE(blockSize, 8);
  console.log(`Sending message. Piece index ${pieceIndex}, Block offset: ${blockOffset}, Block size: ${blockSize}`);
  sendPeerMessage(socket, MessageId.REQUEST, payload);
  const response = Buffer.alloc(blockSize);
  let responseOffset = 0;
  do {
    const subResponse = await fetchResponse();
    subResponse.copy(response, responseOffset);
    responseOffset += subResponse.length;
    console.log(`Response length: ${response.length}`);
  } while (response.length < blockSize);

  const { messageId, payload: blockPayload } = parsePeerMessageResponse(response);
  if (messageId !== MessageId.PIECE) {
    throw new Error(`Invalid download response: ${messageId}`);
  }

  return { pieceIndex, blockOffset, blockPayload };
}

async function downloadPiece(sockets, pieceIndex, torrent) {
  const pieceLength = torrent.info['piece length'];
  const pieceBuffer = Buffer.alloc(pieceLength);
  let blockOffset = 0;

  let socketIndex = 0;
  while (blockOffset < pieceLength) {
    const startTime = Date.now();
    const socket = sockets[socketIndex];
    const { blockPayload } = await downloadBlock(socket, torrent, pieceIndex, blockOffset);
    console.log(
      `Socket ${socketIndex}, Piece ${pieceIndex}, Offset ${blockOffset} successfully downloaded in ${Date.now() - startTime}ms`,
    );
    blockPayload.copy(pieceBuffer, blockOffset);
    blockOffset += DEFAULT_BLOCK_SIZE;
    socketIndex = (socketIndex + 1) % sockets.length; // Rotate to the next socket
  }
  return pieceBuffer;
}

async function initialiseSockets(peers, torrent) {
  const sockets = [];
  for (const peer of peers) {
    const socket = await connect(peer.host, peer.port, dataEventHandler);
    await performHandshake(socket, torrent);
    await sendInterestedMessage(socket);
    sockets.push(socket);
  }
  return sockets;
}

function disconnectSockets(sockets) {
  for (const socket of sockets) {
    disconnect(socket);
  }
}

async function handleCommand(parameters) {
  const [, , outputFilePath, inputFile, pieceIndexString] = parameters;
  const pieceIndex = Number(pieceIndexString);
  const buffer = await readFile(inputFile);
  const torrent = decodeBencode(buffer);
  const peers = await fetchPeers(torrent);
  const sockets = await initialiseSockets(peers, torrent);

  try {
    const pieceBuffer = await downloadPiece(sockets, pieceIndex, torrent);
    console.log(`Download finished. Saving to ${outputFilePath}`);
    writeFileSync(outputFilePath, Buffer.from(pieceBuffer));
  } catch (err) {
    console.error('Error during download:', err);
  } finally {
    disconnectSockets(sockets);
  }
}

module.exports = handleCommand;
