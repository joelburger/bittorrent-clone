const {
  parseMagnetLink,
  fetchMagnetPeers,
  createMagnetHandshakeRequest,
  createExtensionHandshakeRequest,
  createMetadataRequest,
} = require('../utils/magnet');
const { connect, disconnect } = require('../utils/network');
const HandshakeMixin = require('../mixins/handshake-mixin');

class MagnetInfo {
  constructor() {
    this.incomingBuffer = Buffer.alloc(0);
    this.handshakeReceived = false;
    this.peerMetadataExtensionId = null;
    this.torrent = {};
  }

  async handleCommand(parameters) {
    const [, magnetLink] = parameters;
    const { infoHash, trackerUrl } = parseMagnetLink(magnetLink);
    const peers = await fetchMagnetPeers(infoHash, trackerUrl);

    this.torrent.announce = trackerUrl;
    this.torrent.info_hash = infoHash;

    const [peer] = peers;
    let socket;
    try {
      socket = await connect(peer.host, peer.port, this.dataEventHandler.bind(this));

      const handshakeRequest = createMagnetHandshakeRequest(infoHash);
      socket.write(handshakeRequest);

      await this.waitForHandshakeReceived();

      const extensionHandshakeRequest = createExtensionHandshakeRequest(1);
      socket.write(extensionHandshakeRequest);

      await this.waitForPeerMetadataExtensionId();

      const metadataRequest = createMetadataRequest(this.peerMetadataExtensionId, 0);
      socket.write(metadataRequest);

      await this.waitForMetadataResponse();

      console.log(`Tracker URL: ${this.torrent.announce}`);
      console.log(`Length: ${this.torrent.info.length}`);
      console.log(`Info Hash: ${this.torrent.info_hash}`);
      console.log(`Piece Length: ${this.torrent.info.pieceLength}`);
      console.log('Piece hashes:');
      this.torrent.info.pieces.forEach((piece) => console.log(piece.toString('hex')));

      socket.destroySoon();
    } catch (err) {
      console.error('Handshake failed', err);
    } finally {
      disconnect(socket);
    }
  }
}

Object.assign(MagnetInfo.prototype, HandshakeMixin);

module.exports = MagnetInfo;
