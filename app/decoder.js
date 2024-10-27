// Examples:
// - decodeBencode("5:hello") -> "hello"
// - decodeBencode("10:hello12345") -> "hello12345"
function decodeBencode(bencodedValue) {
  // Check if the first character is a digit

  const [firstCharacter] = bencodedValue;

  if (isNaN(firstCharacter)) {
    if (firstCharacter === 'i') {
      return Number(bencodedValue.substring(1, bencodedValue.length - 1));
    }
    throw new Error(`Invalid value ${bencodedValue}. Unsupported encoding.`);
  } else {
    const firstColonIndex = bencodedValue.indexOf(':');
    if (firstColonIndex === -1) {
      throw new Error('Invalid encoded value');
    }

    return bencodedValue.substr(firstColonIndex + 1);
  }
}

module.exports = { decodeBencode };
