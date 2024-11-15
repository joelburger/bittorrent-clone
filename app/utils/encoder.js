const crypto = require('crypto');

function encodeBuffer(value) {
  return Buffer.concat([Buffer.from(`${value.length}:`), value]);
}

function encodeString(value) {
  return `${value.length}:${value}`;
}

function encodeInteger(value) {
  return `i${value}e`;
}

function sha1Hash(buffer, encoding) {
  return crypto.createHash('sha1').update(buffer).digest(encoding);
}

module.exports = {
  encodeInteger,
  encodeString,
  encodeBuffer,
  sha1Hash,
};
