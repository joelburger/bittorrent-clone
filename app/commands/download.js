const { decodeBencode } = require('../utils/decoder');
const { fetchPeers, createHandshakeRequest, splitPieces } = require('../utils/torrent');
const { readFile } = require('fs/promises');
const { connect, disconnect } = require('../utils/network');
const { writeFileSync } = require('fs');

const DEFAULT_BLOCK_SIZE = 16 * 1024;

const Status = Object.freeze({
  WAITING_ON_RESPONSE: 'waiting',
  RESPONSE_RECEIVED: 'response-received',
});

const MessageId = Object.freeze({
  CHOKE: 0,
  UNCHOKE: 1,
  INTERESTED: 2,
  NOT_INTERESTED: 3,
  HAVE: 4,
  BITFIELD: 5,
  REQUEST: 6,
  PIECE: 7,
  CANCEL: 8,
});

const connectionState = {
  status: undefined,
  data: [],
};

function dataEventHandler(data) {
  console.log(`response received: ${data.length} bytes`);

  connectionState.status = Status.RESPONSE_RECEIVED;
  connectionState.data.push(data);
}

function clearTimers(timeoutIds, intervalIds) {
  timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
  intervalIds.forEach((intervalId) => clearInterval(intervalId));
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
    const timeoutIds = [];
    const intervalIds = [];

    timeoutIds.push(
      setTimeout(() => {
        clearTimers(timeoutIds, intervalIds);
        reject('Request timeout');
      }, 5000),
    );

    intervalIds.push(
      setInterval(() => {
        if (connectionState.status === Status.RESPONSE_RECEIVED) {
          clearTimers(timeoutIds, intervalIds);
          resolve(Buffer.concat(connectionState.data));
          connectionState.data = [];
        }
      }, 1000),
    );
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

  buffer.writeUInt32BE(messageSize, 0); // Message length prefix (4 bytes)
  buffer.writeUInt8(messageId, 4); // Message ID (1 byte)

  if (payloadBuffer) {
    payloadBuffer.copy(buffer, 5); // Payload (variable size)
  }

  socket.write(buffer);

  connectionState.status = Status.WAITING_ON_RESPONSE;
}

function parsePeerMessageResponse(response) {
  const messageSize = response.readUInt32BE(0);
  const messageId = response.readUint8(4);
  const payload = response.length > 5 ? response.subarray(5) : null;

  return {
    messageId,
    messageSize,
    payload,
  };
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

  // if this is not the last piece, immediately return the default block size
  if (pieceIndex + 1 < numberOfPieces) {
    return DEFAULT_BLOCK_SIZE;
  }

  // if this is not the last block, return the default block size
  if (blockOffset + DEFAULT_BLOCK_SIZE < pieceLength) {
    return DEFAULT_BLOCK_SIZE;
  }

  return pieceLength * numberOfPieces - totalFileLength;
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function downloadPiece(socket, pieceIndex, torrent) {
  const pieceLength = torrent.info['piece length'];
  let blockOffset = 0;
  await sendInterestedMessage(socket);
  const pieceBuffer = Buffer.alloc(pieceLength);
  while (blockOffset < pieceLength) {
    const startTime = Date.now();

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
      console.log(`response length: ${response.length}`);
      //await pause(500);
    } while (response.length < blockSize);

    const { messageId } = parsePeerMessageResponse(response);
    if (messageId !== MessageId.PIECE) {
      throw new Error(`Invalid download response: ${messageId}`);
    }
    console.log(`Piece ${pieceIndex}, Offset ${blockOffset} successfully downloaded in ${Date.now() - startTime}`);
    response.copy(pieceBuffer, blockOffset);
    blockOffset += DEFAULT_BLOCK_SIZE;
  }
  return pieceBuffer;
}

async function handleCommand(parameters) {
  const [, , outputFilePath, inputFile, pieceIndexString] = parameters;
  const pieceIndex = Number(pieceIndexString);
  const buffer = await readFile(inputFile);
  const torrent = decodeBencode(buffer);
  const addresses = await fetchPeers(torrent);
  const [firstPeer] = addresses;

  console.log(torrent.info);
  console.log(firstPeer);

  const socket = await connect(firstPeer.host, firstPeer.port, dataEventHandler);
  socket.on('end', () => {
    console.log('socket end');
  });

  try {
    await performHandshake(socket, torrent);

    const pieceBuffer = await downloadPiece(socket, pieceIndex, torrent);
    console.log(`download finished. saving to ${outputFilePath}`);
    writeFileSync(outputFilePath, Buffer.from(pieceBuffer));
  } catch (err) {
    console.error(err);
  } finally {
    disconnect(socket);
  }
}

module.exports = handleCommand;
