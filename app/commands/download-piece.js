const { sendHandshake, splitPieces, fetchPeers } = require('../utils/torrent');
const { writeFileSync } = require('fs');
const { readFile } = require('fs/promises');
const { decodeBencode } = require('../utils/decoder');
const { disconnect } = require('../utils/network');
const { sha1Hash } = require('../utils/encoder');

const DEFAULT_BLOCK_SIZE = 16 * 1024;

function sendMessage(socket, messageId, payload) {
  const payloadBuffer = payload ? Buffer.from(payload) : undefined;
  const messageSize = (payload ? payload.length : 0) + 1;
  const buffer = Buffer.alloc(4 + messageSize, 0);

  buffer.writeUInt32BE(messageSize, 0); // Message length prefix (4 bytes)
  buffer.writeUInt8(messageId, 4); // Message ID (1 byte)
  if (payloadBuffer) {
    payloadBuffer.copy(buffer, 5); // Payload (variable size)
  }

  socket.write(buffer);

  return buffer;
}

function removeAllListeners(socket) {
  socket.removeAllListeners('data');
  socket.removeAllListeners('error');
}

async function receiveResponse(socket, expectedMessageId) {
  return new Promise((resolve, reject) => {
    socket.on('data', (data) => {
      const messageSize = data.readUInt32BE(0);
      const messageId = data.readUint8(4);
      const payload = messageSize > 1 ? data.subarray(5) : null;
      removeAllListeners(socket);
      resolve({ messageSize, messageId, payload });
    });

    socket.on('error', (err) => {
      removeAllListeners(socket);
      reject(err);
    });
  });
}

async function downloadBlock(socket, pieceIndex, blockOffset, blockSize) {
  const requestPayload = Buffer.alloc(12);
  requestPayload.writeUInt32BE(pieceIndex, 0);
  requestPayload.writeUInt32BE(blockOffset, 4);
  requestPayload.writeUInt32BE(blockSize, 8);
  sendMessage(socket, 6, requestPayload);
  console.log('download block', { pieceIndex, blockOffset, blockSize });

  return receiveResponse(socket);
}

function padArrayWithZeroes(arr, n) {
  if (arr.length >= n) {
    return arr; // Return the original array if it's already long enough
  }
  return [...arr, ...Array(n - arr.length).fill(0)];
}

function calculateBlockSize(pieceIndex, info, blockOffset) {
  const pieceLength = info['piece length'];
  const numberOfPieces = splitPieces(info.pieces).length;
  const totalFileLength = info.length;

  // if this is not the last piece, immediately return the default block size
  if (pieceIndex + 1 < numberOfPieces) {
    return DEFAULT_BLOCK_SIZE;
  }

  // if this is not the last block, immediately return the default block size
  if (blockOffset + DEFAULT_BLOCK_SIZE < pieceLength) {
    return DEFAULT_BLOCK_SIZE;
  }

  return pieceLength * numberOfPieces - totalFileLength;
}

async function downloadPiece(socket, pieceIndex, info) {
  const output = [];
  let blockOffset = 0;
  while (blockOffset < info['piece length']) {
    let retryCount = 0;
    let messageId, messageSize, payload;
    const blockSize = calculateBlockSize(pieceIndex, info, blockOffset);
    do {
      ({ messageId, messageSize, payload } = await downloadBlock(socket, pieceIndex, blockOffset, blockSize));
      await new Promise((resolve) => setTimeout(resolve, 1000));
      retryCount += 1;
    } while (messageId !== 7 && retryCount <= 10);

    const payloadData = payload.subarray(8).length;

    console.log('>', {
      pieceIndex,
      messageId,
      messageSize,
      payloadIndex: payload.readUInt32BE(0),
      payloadOffset: payload.readUInt32BE(4),
      payloadDataSize: payloadData.length,
    });

    if (messageId === 7) {
      output.push(...Array.from(payload.subarray(8)));
    } else {
      throw new Error(`unexpected message ID response: ${messageId}`);
    }
    blockOffset += DEFAULT_BLOCK_SIZE;
  }
  return output;
}

async function handleCommand(parameters) {
  const [, , outputFilePath, inputFile, pieceIndexString] = parameters;
  const pieceIndex = Number(pieceIndexString);
  const buffer = await readFile(inputFile);
  const torrent = decodeBencode(buffer);
  const addresses = await fetchPeers(torrent);
  const [firstPeer, secondPeer, thirdPeer] = addresses;

  let socket, handshakeResponse;
  try {
    ({ socket, data: handshakeResponse } = await sendHandshake(torrent.info, firstPeer));
    console.log('handshake response', handshakeResponse.toString('hex'));

    sendMessage(socket, 2);

    console.log('Sent interested message');

    const unchokeResponse = await receiveResponse(socket);
    console.log('unchoke message received', { ...unchokeResponse });

    const output = await downloadPiece(socket, pieceIndex, torrent.info);

    console.log(`download finished. saving to ${outputFilePath}`);
    writeFileSync(outputFilePath, Buffer.from(output));
  } finally {
    disconnect(socket);
  }
}

module.exports = handleCommand;
