const { sendHandshake, splitPieces, fetchPeers } = require('../utils/torrent');
const { writeFileSync } = require('fs');
const { readFile } = require('fs/promises');
const { decodeBencode } = require('../utils/decoder');
const { disconnect } = require('../utils/network');

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

      if (!expectedMessageId || (expectedMessageId && messageId === expectedMessageId)) {
        const payload = messageSize > 1 ? data.subarray(5) : null;
        removeAllListeners(socket);
        resolve({ messageSize, messageId, payload });
      }
    });

    socket.on('error', (err) => {
      removeAllListeners(socket);
      reject(err);
    });
  });
}

async function downloadBlock(socket, pieceIndex, blockOffset, blockSize) {
  // Break the piece into blocks of 16 kiB (16 * 1024 bytes) and send a request message for each block
  // The message id for request is 6.
  // The payload for this message consists of:
  // index: the zero-based piece index
  // begin: the zero-based byte offset within the piece
  // This'll be 0 for the first block, 2^14 for the second block, 2*2^14 for the third block etc.
  // length: the length of the block in bytes
  // This'll be 2^14 (16 * 1024) for all blocks except the last one.
  // The last block will contain 2^14 bytes or less, you'll need calculate this value using the piece length.
  // Wait for a piece message for each block you've requested
  // The message id for piece is 7.
  // The payload for this message consists of:
  // index: the zero-based piece index
  // begin: the zero-based byte offset within the piece
  // block: the data for the piece, usually 2^14 bytes long
  // After receiving blocks and combining them into pieces, you'll want to check the integrity of each piece by comparing its hash with the piece hash value found in the torrent file.
  const requestPayload = Buffer.alloc(12);
  requestPayload.writeUInt32BE(pieceIndex, 0);
  requestPayload.writeUInt32BE(blockOffset, 4);
  requestPayload.writeUInt32BE(blockSize, 8);
  sendMessage(socket, 6, requestPayload);
  console.log('download block', { pieceIndex, blockOffset, blockSize });

  return receiveResponse(socket);
}

async function downloadFile(info, peer, outputFilePath) {
  let socket, handshakeResponse;
  try {
    ({ socket, data: handshakeResponse } = await sendHandshake(info, peer));

    console.log('handshake response', handshakeResponse.toString('hex'));

    //Peer messages consist of a message length prefix (4 bytes), message id (1 byte) and a payload (variable size).

    // Wait for a bitfield message from the peer indicating which pieces it has
    // The message id for this message type is 5.
    // You can read and ignore the payload for now, the tracker we use for this challenge ensures that all peers have all pieces available.

    // Send an interested message
    // The message id for interested is 2.
    // The payload for this message is empty.
    sendMessage(socket, 2);
    console.log('Sent interested message');

    // Wait until you receive an unchoke message back
    // The message id for unchoke is 1.
    // The payload for this message is empty.
    const unchokeResponse = await receiveResponse(socket);
    console.log('unchoke message received', { ...unchokeResponse });

    console.log('info', info);

    const fileByteArray = [];
    let pieceIndex = 0;
    const defaultBlockSize = 16 * 1024;
    for (const piece of splitPieces(info.pieces)) {
      for (let blockOffset = 0; blockOffset < info['piece length']; blockOffset += defaultBlockSize) {
        let blockSize;
        if (fileByteArray.length + defaultBlockSize > info.length) {
          blockSize = info.length - fileByteArray.length;
        } else {
          blockSize = defaultBlockSize;
        }
        const {
          messageId,
          messageSize,
          payload: blockBuffer,
        } = await downloadBlock(socket, pieceIndex, blockOffset, blockSize);
        console.log('>', { pieceIndex, messageId, messageSize });
        if (messageId === 7) {
          fileByteArray.push(...blockBuffer);
        }
      }
      pieceIndex++;
    }
    console.log(`download finished. saving to ${outputFilePath}`);
    writeFileSync(outputFilePath, Buffer.from(fileByteArray));
  } catch (err) {
    console.error('Failed to download file', err);
  } finally {
    disconnect(socket);
  }
}

async function handleCommand(parameters) {
  const [, , outputFilePath, inputFile] = parameters;
  const buffer = await readFile(inputFile);
  const torrent = decodeBencode(buffer);
  const addresses = await fetchPeers(torrent);
  const [firstPeer] = addresses;

  await downloadFile(torrent.info, firstPeer, outputFilePath);
}

module.exports = handleCommand;
