const crypto = require('crypto');
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

module.exports = {
  HASH_LENGTH,
  calculateInfoHash,
};
