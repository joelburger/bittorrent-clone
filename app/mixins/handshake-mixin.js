const { isHandshakeResponse, parseHandshake } = require('../utils/handshake');
const { MessageId, splitPieceHashes } = require('../utils/torrent');
const { decodeBencode } = require('../utils/decoder');
const HandshakeMixin = {
  async waitForPeerMetadataExtensionId() {
    return new Promise((resolve) => {
      const intervalId = setInterval(() => {
        if (this.peerMetadataExtensionId) {
          clearInterval(intervalId);
          resolve();
        }
      }, 1000);
    });
  },

  async waitForMetadataResponse() {
    return new Promise((resolve) => {
      const intervalId = setInterval(() => {
        if (this.torrent.info) {
          clearInterval(intervalId);
          resolve();
        }
      }, 1000);
    });
  },

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

    console.log('messageId', messageId);
    console.log('message', message.length);

    if (messageId === MessageId.EXTENDED) {
      const payload = message.subarray(1);
      const dictionary = payload.subarray(1);
      const decoded = decodeBencode(dictionary);

      if (decoded.hasOwnProperty('m')) {
        this.peerMetadataExtensionId = decoded.m['ut_metadata'];
        console.log(`Peer Metadata Extension ID: ${this.peerMetadataExtensionId}`);
      } else if (decoded.hasOwnProperty('msg_type')) {
        const { msg_type, piece, total_size } = decoded;
        console.log({ msg_type, piece, total_size });

        const metadataPiece = decodeBencode(message.subarray(message.length - total_size));
        console.log(metadataPiece, JSON.stringify(metadataPiece));

        const pieces = splitPieceHashes(metadataPiece.pieces);

        this.torrent.info = {
          length: metadataPiece.length,
          pieceLength: metadataPiece['piece length'],
          pieces,
        };
      } else {
        console.log('decoded', decoded);
      }
    }
  },
};

module.exports = HandshakeMixin;
