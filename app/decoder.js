function parseInteger(buffer, offset) {
  let cursor = offset;

  // confirm first characters is the letter i
  const firstCharacter = String.fromCharCode(buffer.readInt8(cursor));
  cursor++;

  if (firstCharacter !== 'i') {
    throw new Error('Invalid number encoding. Invalid first character');
  }

  const terminatorPosition = buffer.indexOf('e', cursor);

  if (terminatorPosition === -1) {
    throw new Error('Invalid number encoding. Missing terminator character');
  }

  const result = buffer.subarray(cursor, terminatorPosition).toString();
  cursor += result.length + 1;

  return { value: Number(result), newCursor: cursor };
}

function parseByteString(bencodedValue, offset) {
  let cursor = offset;
  const delimiterPosition = bencodedValue.indexOf(':', cursor);

  if (delimiterPosition === -1) {
    throw new Error('Invalid string encoding. Missing colon delimiter.');
  }

  const stringLength = Number(bencodedValue.subarray(cursor, delimiterPosition));
  cursor += stringLength.toString().length + 1;

  const value = bencodedValue.subarray(cursor, cursor + stringLength);
  cursor += value.length;

  return { value, newCursor: cursor };
}

function parseList(buffer, offset = 0) {
  let cursor = offset;
  cursor++; // skip first character since we've already read it previously

  const values = [];

  do {
    const currentChar = String.fromCharCode(buffer.readInt8(cursor));

    if (isNaN(currentChar)) {
      if (currentChar === 'i') {
        const { value, newCursor } = parseInteger(buffer, cursor);
        cursor = newCursor;
        values.push(value);
      }
      if (currentChar === 'l') {
        const { values: nestedValues, newCursor } = parseList(buffer, cursor);
        cursor = newCursor;
        values.push(nestedValues);
      }

      if (currentChar === 'e') {
        // terminator char found at the end of the list
        cursor++;
        break;
      }
    } else {
      const { value, newCursor } = parseByteString(buffer, cursor);
      cursor = newCursor;
      values.push(value);
    }
  } while (cursor < buffer.length);

  return { values, newCursor: cursor };
}

function parseDictionary(buffer, offset) {
  let cursor = offset;
  cursor++; // skip first character since we've already read it previously

  const values = {};
  do {
    let currentChar = String.fromCharCode(buffer.readInt8(cursor));

    // get key
    let dictionaryKey;
    if (isNaN(currentChar)) {
      if (currentChar === 'e') {
        cursor++;
        break;
      } else {
        throw new Error(`Invalid key encoding found for dictionary: ${buffer.toString()}`);
      }
    } else {
      const { value, newCursor } = parseByteString(buffer, cursor);
      cursor = newCursor;
      dictionaryKey = value;
    }

    currentChar = String.fromCharCode(buffer.readInt8(cursor));

    let dictionaryValue;
    if (isNaN(currentChar)) {
      if (currentChar === 'i') {
        const { value, newCursor } = parseInteger(buffer, cursor);
        cursor = newCursor;
        dictionaryValue = value;
      } else if (currentChar === 'l') {
        const { values, newCursor } = parseList(buffer, cursor);
        cursor = newCursor;
        dictionaryValue = values;
      } else if (currentChar === 'd') {
        const { values, newCursor } = parseDictionary(buffer, cursor);
        cursor = newCursor;
        dictionaryValue = values;
      } else {
        throw new Error(`Invalid value encoding found for dictionary: ${buffer.toString()}`);
      }
    } else {
      const { value, newCursor } = parseByteString(buffer, cursor);
      cursor = newCursor;
      dictionaryValue = value;
    }
    values[dictionaryKey] = dictionaryValue;
  } while (cursor < buffer.length);
  return { values, newCursor: cursor };
}

function decodeBencode(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Invalid parameter type. Parameter must be a buffer');
  }

  const firstCharacter = String.fromCharCode(buffer.readInt8(0));
  const lastCharacter = String.fromCharCode(buffer.readInt8(buffer.length - 1));

  if (isNaN(firstCharacter)) {
    if (firstCharacter === 'i') {
      const { value } = parseInteger(buffer, 0);
      return value;
    }
    if (firstCharacter === 'l' && lastCharacter === 'e') {
      const { values } = parseList(buffer, 0);
      return values;
    }

    if (firstCharacter === 'd') {
      const { values } = parseDictionary(buffer, 0);

      return values;
    }

    throw new Error(`Invalid value ${buffer}. Unsupported encoding.`);
  } else {
    const { value } = parseByteString(buffer, 0);
    return value;
  }
}

module.exports = { decodeBencode };
