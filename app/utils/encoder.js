function encodeBuffer(value) {
  return Buffer.concat([Buffer.from(`${value.length}:`), value]);
}

function encodeString(value) {
  return `${value.length}:${value}`;
}

function encodeInteger(value) {
  return `i${value}e`;
}

module.exports = {
  encodeInteger,
  encodeString,
  encodeBuffer,
};
