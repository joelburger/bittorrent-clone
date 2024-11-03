const process = require('process');
const { readFile } = require('fs/promises');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { decodeBencode } = require('./decoder');

const HASH_LENGTH = 20;

function sha1Hash(buffer, encoding) {
  return crypto.createHash('sha1').update(buffer).digest(encoding);
}

function calculateInfoHash(info, hashLength, encoding = 'hex') {
  const numberOfPieces = info.pieces.length / hashLength;
  const buffer = Buffer.concat([
    Buffer.from(
      `d6:lengthi${info.length}e4:name${info.name.length}:${info.name}12:piece lengthi${info['piece length']}e6:pieces${numberOfPieces * hashLength}:`,
    ),
    info.pieces,
    Buffer.from('e'),
  ]);

  return sha1Hash(buffer, encoding);
}

function splitPieces(pieces, hashLength) {
  const result = [];
  for (let i = 0; i < pieces.length; i += hashLength) {
    result.push(pieces.subarray(i, i + hashLength));
  }
  return result;
}

function convertBuffersToStrings(obj) {
  if (Buffer.isBuffer(obj)) {
    return obj.toString();
  } else if (Array.isArray(obj)) {
    return obj.map(convertBuffersToStrings);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, convertBuffersToStrings(value)]));
  }
  return obj;
}

function urlEncodeInfoHash(infoHash) {
  // Let's say the hexadecimal representation of our info hash is d69f91e6b2ae4c542468d1073a71d4ea13879a7f
  // This 40 character long string was representing 20 bytes, so each character pair corresponds to a byte
  // We can just put a % before each byte so the URL-encoded representation would be:%d6%9f%91%e6%b2%ae%4c%54%24%68%d1%07%3a%71%d4%ea%13%87%9a%7f
  const result = [];
  for (let i = 0; i < infoHash.length; i += 2) {
    result.push('%' + infoHash.substring(i, i + 2));
  }
  return result.join('');
}

function parsePeers(peers) {
  const addresses = [];
  for (let i = 0; i < peers.length; i += 6) {
    const peer = peers.subarray(i, i + 6);
    const address = peer[0] + '.' + peer[1] + '.' + peer[2] + '.' + peer[3] + ':' + peer.readUInt16BE(4);
    addresses.push(address);
  }
  return addresses;
}

async function main() {
  const command = process.argv[2];

  if (command === 'decode') {
    const buffer = Buffer.from(process.argv[3]);
    const result = decodeBencode(buffer);
    console.log(JSON.stringify(convertBuffersToStrings(result)));
  } else if (command === 'info') {
    const inputFile = process.argv[3];
    const buffer = await readFile(inputFile);
    const torrent = decodeBencode(buffer);
    console.log(`Tracker URL: ${torrent.announce.toString()}`);
    console.log(`Length: ${torrent.info.length}`);
    console.log(`Info Hash: ${calculateInfoHash(torrent.info, HASH_LENGTH)}`);
    console.log(`Piece Length: ${torrent.info['piece length']}`);
    console.log('Piece Hashes:');

    splitPieces(torrent.info.pieces, HASH_LENGTH).forEach((piece) => {
      console.log(piece.toString('hex'));
    });
  } else if (command === 'peers') {
    const inputFile = process.argv[3];
    const buffer = await readFile(inputFile);
    const torrent = decodeBencode(buffer);
    try {
      const queryParams =
        `info_hash=${urlEncodeInfoHash(calculateInfoHash(torrent.info, HASH_LENGTH))}` +
        `&peer_id=12345678901234567890` +
        `&port=6881` +
        `&uploaded=0` +
        `&downloaded=0` +
        `&left=${torrent.info.length}` +
        `&compact=1`;

      const url = `${torrent.announce.toString()}?${queryParams}`;
      const response = await fetch(url);
      const data = await response.arrayBuffer();

      const result = decodeBencode(Buffer.from(data));
      const addresses = parsePeers(result.peers);

      addresses.forEach((address) => {
        console.log(address);
      });
    } catch (err) {
      console.log('err', err);
    }
  } else {
    throw new Error(`Unknown command ${command}`);
  }
}

main();
