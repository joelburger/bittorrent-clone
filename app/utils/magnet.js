const { generatePeerId, urlEncodeInfoHash, parsePeers } = require('./torrent');
const { decodeBencode } = require('./decoder');

function createMagnetHandshakeRequest(infoHash) {
  const buffer = Buffer.alloc(68);
  buffer.writeUInt8(19, 0); // Length of the protocol string
  buffer.write('BitTorrent protocol', 1); // Protocol string
  buffer.fill(0, 20, 28);
  buffer.writeUInt8(0x10, 25);
  buffer.write(infoHash, 28, 'hex'); // Info hash (20 bytes)
  buffer.write(generatePeerId(), 48, 'binary'); // Peer ID (20 bytes)

  return buffer;
}

function parseMagnetLink(magnetLink) {
  const url = new URL(magnetLink);
  const params = new URLSearchParams(url.search);

  const infoHash = params.get('xt')?.split(':').pop();
  const fileName = params.get('dn');
  const trackerUrl = params.get('tr');

  return { infoHash, fileName, trackerUrl };
}

async function fetchMagnetPeers(infoHash, trackerUrl) {
  try {
    const peerId = generatePeerId();
    const queryParams =
      `info_hash=${urlEncodeInfoHash(infoHash)}` +
      `&peer_id=${peerId}` +
      `&port=6881` +
      `&uploaded=0` +
      `&downloaded=0` +
      `&left=999` + // dummy value
      `&compact=1`;

    const url = `${trackerUrl}?${queryParams}`;
    const response = await fetch(url);
    const data = await response.arrayBuffer();

    const result = decodeBencode(Buffer.from(data));
    const peers = parsePeers(result.peers);

    console.log('peers', peers);

    return peers;
  } catch (err) {
    throw new Error(`Failed to fetch peers. Error: ${err.message}`);
  }
}

module.exports = {
  parseMagnetLink,
  createMagnetHandshakeRequest,
  fetchMagnetPeers,
};
