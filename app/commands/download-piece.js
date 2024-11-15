const { sendHandshake, splitPieces, fetchPeers } = require('../utils/torrent');
const { writeFileSync } = require('fs');
const { readFile } = require('fs/promises');
const { decodeBencode } = require('../utils/decoder');
const { disconnect } = require('../utils/network');
const { sha1Hash } = require('../utils/encoder');

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

async function downloadFile(info, peer, outputFilePath) {
  let socket, handshakeResponse;
  try {
    ({ socket, data: handshakeResponse } = await sendHandshake(info, peer));
    console.log('handshake response', handshakeResponse.toString('hex'));

    sendMessage(socket, 2);
    console.log('Sent interested message');

    const unchokeResponse = await receiveResponse(socket);
    console.log('unchoke message received', { ...unchokeResponse });

    const fileByteArray = [];
    let totalSize = 0;
    let pieceIndex = 0;
    const defaultBlockSize = 16 * 1024;
    for (const piece of splitPieces(info.pieces)) {
      let pieceByteArray = [];
      let blockOffset = 0;
      while (blockOffset < info['piece length']) {
        let blockSize;
        if (totalSize + defaultBlockSize > info.length) {
          blockSize = info.length - totalSize;
        } else {
          blockSize = defaultBlockSize;
        }
        let retryCount = 0;
        let messageId, messageSize, payload;

        do {
          ({ messageId, messageSize, payload } = await downloadBlock(socket, pieceIndex, blockOffset, blockSize));
          retryCount += 1;
        } while (messageId !== 7 && retryCount <= 5);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        console.log('>', { pieceIndex, messageId, messageSize, payload: payload.length });
        if (messageId === 7) {
          pieceByteArray.push(...Array.from(payload));
        } else {
          throw new Error(`unexpected message ID response: ${messageId}`);
        }
        totalSize += blockSize;
        blockOffset += defaultBlockSize;
      }
      console.log(
        `pieceIndex: ${pieceIndex}, expected: ${piece.toString('hex')}, actual: ${sha1Hash(Buffer.from(fileByteArray), 'hex')}`,
      );
      console.log('\n');
      fileByteArray.push(...pieceByteArray);
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
  const [firstPeer, secondPeer, thirdPeer] = addresses;

  await downloadFile(torrent.info, firstPeer, outputFilePath);
}

module.exports = handleCommand;
