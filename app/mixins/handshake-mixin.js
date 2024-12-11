const { isHandshakeResponse, parseHandshake } = require('../utils/handshake');
const { MessageId } = require('../utils/torrent');
const { decodeBencode } = require('../utils/decoder');
const HandshakeMixin = {
  async waitForHandshakeReceived() {
    return new Promise((resolve) => {
      const intervalId = setInterval(() => {
        if (this.handshakeReceived) {
          clearInterval(intervalId);
          resolve();
        }
      }, 1000);
    });
  },

  dataEventHandler(chunk) {
    console.log(`Response received: ${chunk.length} bytes`);
    this.incomingBuffer = Buffer.concat([this.incomingBuffer, chunk]);

    while (this.incomingBuffer.length >= 4) {
      if (isHandshakeResponse(this.incomingBuffer)) {
        const { supportsExtension, peerId } = parseHandshake(this.incomingBuffer);

        console.log(`Peer ID: ${peerId}`);
        this.incomingBuffer = this.incomingBuffer.slice(68);
        this.handshakeReceived = true;
        continue;
      }

      const messageLength = this.incomingBuffer.readUInt32BE(0);
      if (this.incomingBuffer.length < messageLength + 4) break;

      const message = this.incomingBuffer.slice(4, 4 + messageLength);
      this.processPeerMessage(message);
      this.incomingBuffer = this.incomingBuffer.slice(4 + messageLength);
    }
  },

  processPeerMessage(message) {
    const messageId = message.readUint8(0);

    if (messageId === MessageId.EXTENDED) {
      const payload = message.subarray(1);
      const dictionary = payload.subarray(1);
      const decoded = decodeBencode(dictionary);

      const peerMetadataExtensionId = decoded.m['ut_metadata'];

      console.log(`Peer Metadata Extension ID: ${peerMetadataExtensionId}`);
    }
  },
};

module.exports = HandshakeMixin;
