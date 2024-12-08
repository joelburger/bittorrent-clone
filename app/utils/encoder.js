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

function bencode(value) {
  if (typeof value === 'string') {
    return encodeString(value);
  } else if (typeof value === 'number') {
    return encodeInteger(value);
  } else if (Array.isArray(value)) {
    return `l${value.map(bencode).join('')}e`;
  } else if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `d${keys.map((key) => `${bencode(key)}${bencode(value[key])}`).join('')}e`;
  } else {
    throw new Error('Unsupported data type');
  }
}

function sha1Hash(buffer, encoding) {
  return crypto.createHash('sha1').update(buffer).digest(encoding);
}

module.exports = {
  bencode,
  encodeInteger,
  encodeString,
  encodeBuffer,
  sha1Hash,
};
