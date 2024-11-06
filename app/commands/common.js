const crypto = require('crypto');
const INFO_HASH_LENGTH = 20;

function generateRandomString(length = 20) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const charactersLength = characters.length;

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
}

function sha1Hash(buffer, encoding) {
  return crypto.createHash('sha1').update(buffer).digest(encoding);
}

function calculateInfoHash(info, encoding = 'hex') {
  const numberOfPieces = info.pieces.length / INFO_HASH_LENGTH;

  // TODO Refactor this
  const buffer = Buffer.concat([
    Buffer.from(
      `d6:lengthi${info.length}e` +
        `4:name${info.name.length}:${info.name}` +
        `12:piece lengthi${info['piece length']}e` +
        `6:pieces${numberOfPieces * INFO_HASH_LENGTH}:`,
    ),
    info.pieces,
    Buffer.from('e'),
  ]);

  return sha1Hash(buffer, encoding);
}

module.exports = {
  calculateInfoHash,
  generateRandomString,
};
