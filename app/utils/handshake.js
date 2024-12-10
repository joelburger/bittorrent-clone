function isHandshakeResponse(handshakeResponse) {
  if (!handshakeResponse || handshakeResponse.length < 68) {
    return false;
  }

  const protocolLength = handshakeResponse.readUint8(0);
  const protocol = handshakeResponse.subarray(1, protocolLength + 1).toString();

  return protocol === 'BitTorrent protocol';
}

function parseHandshake(data) {
  const supportsExtension = data.readUint8(25) === 0x10;
  const peerId = data.subarray(48, 68).toString('hex');

  return { supportsExtension, peerId };
}

module.exports = {
  isHandshakeResponse,
  parseHandshake,
};
