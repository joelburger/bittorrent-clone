const {
  parseMagnetLink,
  fetchMagnetPeers,
  createMagnetHandshakeRequest,
  createExtensionHandshakeRequest,
  createMetadataRequest,
} = require('../utils/magnet');
const { connect, disconnect } = require('../utils/network');
const { decodeBencode } = require('../utils/decoder');
const { isHandshakeResponse, parseHandshake } = require('../utils/handshake');
const {
  calculatePieceLength,
  createBlockRequest,
  BLOCK_REQUEST_SIZE,
  splitPieceHashes,
  createPeerMessage,
  MessageId,
  parseBlockPayload,
} = require('../utils/torrent');
const { sha1Hash } = require('../utils/encoder');
const { writeFileSync } = require('fs');
const HandshakeMixin = require('../mixins/handshake-mixin');

const MAXIMUM_OUTGOING_BUFFER_SIZE = BLOCK_REQUEST_SIZE * 5;

const PeerConnectionStatus = Object.freeze({
  PENDING: 'pending',
  HANDSHAKE_RECEIVED: 'handshake received',
  UNCHOKE_RECEIVED: 'unchoke received',
});

class MagnetDownload {
  constructor() {
    (this.blocks = new Map()),
      (this.connectionStatus = PeerConnectionStatus.PENDING),
      (this.incomingBuffer = Buffer.alloc(0)),
      (this.outgoingBuffer = Buffer.alloc(0)),
      (this.peerMetadataExtensionId = undefined),
      (this.torrent = {
        info: {},
      });
  }

  resetState() {
    this.blocks = new Map();
    this.incomingBuffer = Buffer.alloc(0);
    this.outgoingBuffer = Buffer.alloc(0);
  }

  processPeerMessage(message) {
    const messageId = message.readUint8(0);

    if (messageId === MessageId.PIECE) {
      const blockPayload = message.subarray(1);
      const { pieceIndex, blockOffset, block } = parseBlockPayload(blockPayload);

      console.log(
        `Successfully fetched block. Piece index: ${pieceIndex}, Block offset: ${blockOffset}, Block size: ${block.length}`,
      );

      this.blocks.set(`${pieceIndex}-${blockOffset}`, block);
      return;
    }

    if (messageId === MessageId.UNCHOKE) {
      this.connectionStatus = PeerConnectionStatus.UNCHOKE_RECEIVED;
      return;
    }

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

        const splitPieces = splitPieceHashes(metadataPiece.pieces);

        this.torrent.info = {
          length: metadataPiece.length,
          'piece length': metadataPiece['piece length'],
          splitPieces,
          pieces: metadataPiece.pieces,
        };

        console.log(`Peer Metadata Extension ID: ${this.peerMetadataExtensionId}`);
      }
    }
  }

  dataEventHandler(chunk) {
    console.log(`Response received: ${chunk.length} bytes`);
    this.incomingBuffer = Buffer.concat([this.incomingBuffer, chunk]);

    while (this.incomingBuffer.length >= 4) {
      if (isHandshakeResponse(this.incomingBuffer)) {
        const { supportsExtension, peerId } = parseHandshake(this.incomingBuffer);

        console.log(`Peer ID: ${peerId}`);
        this.incomingBuffer = this.incomingBuffer.subarray(68);
        this.connectionStatus = PeerConnectionStatus.HANDSHAKE_RECEIVED;
        continue;
      }

      const messageLength = this.incomingBuffer.readUInt32BE(0);
      if (this.incomingBuffer.length < messageLength + 4) break;

      const message = this.incomingBuffer.subarray(4, 4 + messageLength);
      this.processPeerMessage(message);
      this.incomingBuffer = this.incomingBuffer.subarray(4 + messageLength);
    }
  }

  async waitForHandshakeReceived() {
    return new Promise((resolve) => {
      const intervalId = setInterval(() => {
        if (this.connectionStatus === PeerConnectionStatus.HANDSHAKE_RECEIVED) {
          clearInterval(intervalId);
          resolve();
        }
      }, 1000);
    });
  }

  flushOutgoingBuffer(socket) {
    console.log(`Sending ${this.outgoingBuffer.length / BLOCK_REQUEST_SIZE} request messages to peer`);
    socket.write(this.outgoingBuffer);
    this.outgoingBuffer = Buffer.alloc(0);
  }

  async downloadPiece(socket, pieceIndex) {
    let blockOffset = 0;
    let totalBlockCount = 0;

    const calculatedPieceLength = calculatePieceLength(pieceIndex, this.torrent.info);

    this.outgoingBuffer = Buffer.alloc(0);
    while (blockOffset < calculatedPieceLength) {
      const { blockSize, peerMessage } = createBlockRequest(
        this.torrent,
        pieceIndex,
        calculatedPieceLength,
        blockOffset,
      );
      console.log(
        `\x1b[32mAdding block request to outgoing buffer. Piece index ${pieceIndex}, Block offset: ${blockOffset}, Block size: ${blockSize}\x1b[0m`,
      );

      this.outgoingBuffer = Buffer.concat([this.outgoingBuffer, peerMessage]);

      blockOffset += blockSize;
      totalBlockCount++;

      if (this.outgoingBuffer.length >= MAXIMUM_OUTGOING_BUFFER_SIZE && this.incomingBuffer.length === 0) {
        this.flushOutgoingBuffer(socket);
      }
    }

    if (this.outgoingBuffer.length > 0 && this.incomingBuffer.length === 0) {
      console.log('Flushing remaining outgoing buffer');
      this.flushOutgoingBuffer(socket);
    }

    await this.waitForAllBlocks(totalBlockCount);

    return this.convertMapToBuffer(this.blocks);
  }

  convertMapToBuffer() {
    const sortedBlocks = Array.from(this.blocks.entries())
      .sort(([a], [b]) => {
        const [pieceIndexA, blockOffsetA] = a.split('-').map(Number);
        const [pieceIndexB, blockOffsetB] = b.split('-').map(Number);
        return pieceIndexA - pieceIndexB || blockOffsetA - blockOffsetB;
      })
      .map(([, block]) => block);

    return Buffer.concat(sortedBlocks);
  }

  async waitForAllBlocks(totalBlockCount, timeout = 10000) {
    return new Promise((resolve, reject) => {
      let timeoutId, intervalId;
      timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        reject(new Error('Blocks not received within the timeout period'));
      }, timeout);

      intervalId = setInterval(() => {
        if (this.blocks.size === totalBlockCount) {
          clearInterval(intervalId);
          clearTimeout(timeoutId);
          resolve();
        }
      }, 1);
    });
  }

  async waitForPeerMetadataExtensionId() {
    return new Promise((resolve) => {
      const intervalId = setInterval(() => {
        if (this.peerMetadataExtensionId) {
          clearInterval(intervalId);
          resolve();
        }
      }, 1000);
    });
  }

  async waitForMetadataResponse() {
    return new Promise((resolve) => {
      const intervalId = setInterval(() => {
        if (this.torrent.info) {
          clearInterval(intervalId);
          resolve();
        }
      }, 1000);
    });
  }

  async sendInterestedMessage(socket) {
    console.log('Sending interested message');
    const peerMessage = createPeerMessage(MessageId.INTERESTED);
    socket.write(peerMessage);
    await this.waitForConnectionStatus(PeerConnectionStatus.UNCHOKE_RECEIVED);
    console.log('Unchoke received');
  }

  async waitForConnectionStatus(expectedConnectionStatus, timeout = 5000) {
    return new Promise((resolve, reject) => {
      let timeoutId;
      const intervalId = setInterval(() => {
        if (this.connectionStatus === expectedConnectionStatus) {
          clearInterval(intervalId);
          clearTimeout(timeoutId);
          resolve();
        }
      }, 1);

      timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        reject(new Error(`Timeout while waiting for connection status of ${expectedConnectionStatus}`));
      }, timeout);
    });
  }

  validatePieceHash(pieceBuffer, expectedPieceHash) {
    const actualPieceHash = sha1Hash(pieceBuffer, 'hex');
    const expectedPieceHashInHex = Buffer.from(expectedPieceHash).toString('hex');

    if (expectedPieceHashInHex === actualPieceHash) {
      console.log('Piece hash is valid');
      return;
    }

    throw new Error(
      `Invalid piece hash. Size: ${pieceBuffer.length}, Expected: ${expectedPieceHashInHex}, Actual: ${actualPieceHash}`,
    );
  }

  async handleCommand(parameters) {
    const [command, , outputFilePath, magnetLink, pieceIndexString] = parameters;
    const pieceIndex = Number(pieceIndexString);
    const { infoHash, trackerUrl } = parseMagnetLink(magnetLink);

    this.torrent.info_hash = infoHash;
    this.torrent.announce = trackerUrl;

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

      await this.waitForPeerMetadataExtensionId();

      const metadataRequest = createMetadataRequest(this.peerMetadataExtensionId, 0);
      socket.write(metadataRequest);

      await this.waitForMetadataResponse();

      await this.sendInterestedMessage(socket);

      let workQueue;
      if (command === 'magnet_download') {
        workQueue = Array.from({ length: this.torrent.info.splitPieces.length }, (_, index) => index);
      } else {
        workQueue = [pieceIndex];
      }
      let fileBuffer = Buffer.alloc(0);
      for (const pieceIndex of workQueue) {
        const pieceBuffer = await this.downloadPiece(socket, pieceIndex);
        this.validatePieceHash(pieceBuffer, this.torrent.info.splitPieces[pieceIndex]);
        fileBuffer = Buffer.concat([fileBuffer, pieceBuffer]);
        this.resetState();
      }

      console.log(`Download finished. Saving to ${outputFilePath}. Size: ${fileBuffer.length}`);
      writeFileSync(outputFilePath, Buffer.from(fileBuffer));
    } catch (err) {
      console.error('Fatal error', err);
    } finally {
      disconnect(socket);
    }
  }
}

//Object.assign(MagnetHandshake.prototype, HandshakeMixin);

module.exports = MagnetDownload;
