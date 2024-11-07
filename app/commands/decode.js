const { decodeBencode } = require('../utils/decoder');

function convertBuffersToStrings(obj) {
  if (Buffer.isBuffer(obj)) {
    return obj.toString();
  } else if (Array.isArray(obj)) {
    return obj.map(convertBuffersToStrings);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, convertBuffersToStrings(value)]));
  }
  return obj;
}

function handleCommand(parameters) {
  const [, bencodedValue] = parameters;
  const buffer = Buffer.from(bencodedValue);
  const result = decodeBencode(buffer);
  console.log(JSON.stringify(convertBuffersToStrings(result)));
}

module.exports = handleCommand;
