const { encodeInteger, encodeString, encodeBuffer, sha1Hash } = require('./encoder');
const fetch = require('node-fetch');
const { decodeBencode } = require('./decoder');

const PIECES_LENGTH = 20;

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
    return parsePeers(result.peers);
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

function splitPieces(pieces) {
  const result = [];
  for (let i = 0; i < pieces.length; i += PIECES_LENGTH) {
    result.push(pieces.subarray(i, i + PIECES_LENGTH));
  }
  return result;
}

module.exports = {
  createHandshakeRequest,
  calculateInfoHash,
  fetchPeers,
  splitPieces,
};
