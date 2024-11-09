const crypto = require('crypto');
const { encodeInteger, encodeString, encodeBuffer } = require('./encoder');

function generatePeerId(length = 20) {
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
  const buffer = Buffer.concat([
    Buffer.from(
      `d${encodeString('length')}${encodeInteger(info.length)}` +
        `${encodeString('name')}${encodeString(info.name)}` +
        `${encodeString('piece length')}${encodeInteger(info['piece length'])}` +
        `${encodeString('pieces')}`,
    ),
    encodeBuffer(info.pieces),
    Buffer.from('e'),
  ]);

  return sha1Hash(buffer, encoding);
}

module.exports = {
  calculateInfoHash,
  generatePeerId,
};
