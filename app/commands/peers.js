const { readFile } = require('fs/promises');
const { decodeBencode } = require('../utils/decoder');
const fetch = require('node-fetch');
const { calculateInfoHash, generateRandomString } = require('./common');

function parsePeers(peers) {
  const addresses = [];
  for (let i = 0; i < peers.length; i += 6) {
    const peer = peers.subarray(i, i + 6);
    const address = peer[0] + '.' + peer[1] + '.' + peer[2] + '.' + peer[3] + ':' + peer.readUInt16BE(4);
    addresses.push(address);
  }
  return addresses;
}

function urlEncodeInfoHash(infoHash) {
  return infoHash
    .match(/.{1,2}/g)
    .map((byte) => `%${byte}`)
    .join('');
}

async function handleCommand(parameters) {
  const [, inputFile] = parameters;
  const buffer = await readFile(inputFile);
  const torrent = decodeBencode(buffer);
  try {
    const peerId = generateRandomString();
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
    const addresses = parsePeers(result.peers);

    addresses.forEach((address) => {
      console.log(address);
    });
  } catch (err) {
    console.log('err', err);
  }
}

module.exports = handleCommand;
