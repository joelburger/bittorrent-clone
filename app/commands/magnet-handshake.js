const {
  parseMagnetLink,
  fetchMagnetPeers,
  createMagnetHandshakeRequest,
  createExtensionHandshakeRequest,
} = require('../utils/magnet');
const { connect, disconnect } = require('../utils/network');
const { decodeBencode } = require('../utils/decoder');
const { isHandshakeResponse, parseHandshake } = require('../utils/handshake');
const { MessageId } = require('../utils/torrent');
const HandshakeMixin = require('../mixins/handshake-mixin');

class MagnetHandshake {
  constructor() {
    this.incomingBuffer = Buffer.alloc(0);
    this.handshakeReceived = false;
  }

  async handleCommand(parameters) {
    const [, magnetLink] = parameters;
    const { infoHash, trackerUrl } = parseMagnetLink(magnetLink);
    const peers = await fetchMagnetPeers(infoHash, trackerUrl);
    const [peer] = peers;
    let socket;
    try {
      socket = await connect(peer.host, peer.port, this.dataEventHandler.bind(this));

      const handshakeRequest = createMagnetHandshakeRequest(infoHash);
      socket.write(handshakeRequest);

      await this.waitForHandshakeReceived();

      const extensionHandshakeRequest = createExtensionHandshakeRequest(1);
      socket.write(extensionHandshakeRequest);

      socket.destroySoon();
    } catch (err) {
      console.error('Handshake failed', err);
    } finally {
      disconnect(socket);
    }
  }
}

Object.assign(MagnetHandshake.prototype, HandshakeMixin);

module.exports = MagnetHandshake;
