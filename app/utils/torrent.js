const { encodeInteger, encodeString, encodeBuffer, sha1Hash } = require('./encoder');
const fetch = require('node-fetch');
const { decodeBencode } = require('./decoder');

const BLOCK_REQUEST_SIZE = 17;

const PIECES_LENGTH = 20;

const DEFAULT_BLOCK_SIZE = 16 * 1024;

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
  EXTENDED: 20,
});

function generatePeerId(length = 20) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const charactersLength = characters.length;

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
}

function parsePeers(peers) {
  const addresses = [];
  for (let i = 0; i < peers.length; i += 6) {
    const peer = peers.subarray(i, i + 6);
    const address = peer[0] + '.' + peer[1] + '.' + peer[2] + '.' + peer[3] + ':' + peer.readUInt16BE(4);
    addresses.push(address);
  }
  return addresses.map((value) => {
    const [host, portAsString] = value.split(':');
    return { host, port: parseInt(portAsString, 10) };
  });
}

function urlEncodeInfoHash(infoHash) {
  return infoHash
    .match(/.{1,2}/g)
    .map((byte) => `%${byte}`)
    .join('');
}

async function fetchPeers(torrent) {
  try {
    const peerId = generatePeerId();
    const queryParams =
      `info_hash=${urlEncodeInfoHash(calculateInfoHash(torrent.info))}` +
      `&peer_id=${peerId}` +
      `&port=6881` +
      `&uploaded=0` +
      `&downloaded=0` +
      `&left=${torrent.info.length}` +
      `&compact=1`;

    const url = `${torrent.announce.toString()}?${queryParams}`;
    const response = await fetch(url);
    const data = await response.arrayBuffer();

    const result = decodeBencode(Buffer.from(data));

    if (result.hasOwnProperty('failure reason')) {
      throw new Error(`Response from ${url}: ${result['failure reason'].toString()}`);
    }

    const peers = parsePeers(result.peers);

    console.log('peers', peers);

    return peers;
  } catch (err) {
    throw new Error(`Failed to fetch peers. Error: ${err.message}`);
  }
}

function calculateInfoHash(info, encoding = 'hex') {
  const buffer = Buffer.concat([
    Buffer.from(
      `d${encodeString('length')}${encodeInteger(info.length)}` +
        `${encodeString('name')}${encodeString(info.name)}` +
        `${encodeString('piece length')}${encodeInteger(info['piece length'])}` +
        `${encodeString('pieces')}`,
    ),
    encodeBuffer(info.pieces),
    Buffer.from('e'),
  ]);

  return sha1Hash(buffer, encoding);
}

function createHandshakeRequest(info) {
  const infoHashCode = calculateInfoHash(info, 'binary');

  const buffer = Buffer.alloc(68);
  buffer.writeUInt8(19, 0); // Length of the protocol string
  buffer.write('BitTorrent protocol', 1); // Protocol string
  buffer.fill(0, 20, 28); // Reserved bytes (8 bytes)
  buffer.write(infoHashCode, 28, 'binary'); // Info hash (20 bytes)
  buffer.write(generatePeerId(), 48, 'binary'); // Peer ID (20 bytes)

  return buffer;
}

function splitPieceHashes(pieces) {
  const result = [];
  for (let i = 0; i < pieces.length; i += PIECES_LENGTH) {
    result.push(pieces.subarray(i, i + PIECES_LENGTH));
  }
  return result;
}

function decodeTorrent(buffer) {
  const torrent = decodeBencode(buffer);
  torrent.info.splitPieces = splitPieceHashes(torrent.info.pieces);

  console.log('----------------------------');
  console.log(`file length: ${torrent.info.length}`);
  console.log(`piece length: ${torrent.info['piece length']}`);
  console.log(`number of pieces: ${torrent.info.splitPieces.length}`);
  console.log('----------------------------');

  return torrent;
}

function createPeerMessage(messageId, payload) {
  const payloadBuffer = payload ? Buffer.from(payload) : undefined;
  const messageSize = (payload ? payload.length : 0) + 1;
  const peerMessage = Buffer.alloc(4 + messageSize, 0);

  peerMessage.writeUInt32BE(messageSize, 0);
  peerMessage.writeUInt8(messageId, 4);

  if (payloadBuffer) {
    payloadBuffer.copy(peerMessage, 5);
  }

  return peerMessage;
}

function parsePeerMessage(message) {
  const messageId = message.readUint8(0);
  const payload = message.length > 1 ? message.subarray(1) : null;

  return { messageId, payload };
}

function parseBlockPayload(blockPayload) {
  const pieceIndex = blockPayload.readUInt32BE(0);
  const blockOffset = blockPayload.readUInt32BE(4);
  const block = blockPayload.slice(8);

  return { pieceIndex, blockOffset, block };
}

function calculatePieceLength(pieceIndex, info) {
  const pieceLength = info['piece length'];
  const numberOfPieces = info.splitPieces.length;
  const totalFileLength = info.length;

  if (pieceIndex + 1 < numberOfPieces) {
    return pieceLength;
  }

  return totalFileLength - pieceLength * (numberOfPieces - 1);
}

function calculateBlockSize(pieceIndex, pieceLength, info, blockOffset) {
  const isLastPiece = pieceIndex + 1 === info.splitPieces.length;
  const remainingLength = info.length - info['piece length'] * (info.splitPieces.length - 1) - blockOffset;

  return isLastPiece && blockOffset + DEFAULT_BLOCK_SIZE >= pieceLength ? remainingLength : DEFAULT_BLOCK_SIZE;
}

function createBlockRequest(torrent, pieceIndex, pieceLength, blockOffset) {
  const blockSize = calculateBlockSize(pieceIndex, pieceLength, torrent.info, blockOffset);

  const payload = Buffer.alloc(12);
  payload.writeUInt32BE(pieceIndex, 0);
  payload.writeUInt32BE(blockOffset, 4);
  payload.writeUInt32BE(blockSize, 8);

  const peerMessage = createPeerMessage(MessageId.REQUEST, payload);

  return { blockSize, peerMessage };
}

module.exports = {
  MessageId,
  BLOCK_REQUEST_SIZE,
  calculatePieceLength,
  createBlockRequest,
  parsePeerMessage,
  parseBlockPayload,
  createPeerMessage,
  createHandshakeRequest,
  calculateInfoHash,
  fetchPeers,
  decodeTorrent,
  generatePeerId,
  urlEncodeInfoHash,
  parsePeers,
  splitPieceHashes,
};
