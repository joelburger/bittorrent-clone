function parseNumber(bencodedValue, offset) {
  let cursor = offset;

  // confirm first characters is the letter i
  const firstCharacter = bencodedValue.charAt(cursor);
  cursor++;

  if (firstCharacter !== 'i') {
    throw new Error('Invalid number encoding. Invalid first character');
  }

  const terminatorPosition = bencodedValue.indexOf('e', cursor);

  if (terminatorPosition === -1) {
    throw new Error('Invalid number encoding. Missing terminator character');
  }

  const raw = bencodedValue.substring(cursor, terminatorPosition);
  cursor += raw.length + 1;

  return { value: Number(raw), newCursor: cursor };
}

function parseString(bencodedValue, offset) {
  let cursor = offset;
  const delimiterPosition = bencodedValue.indexOf(':', cursor);

  if (delimiterPosition === -1) {
    throw new Error('Invalid string encoding. Missing colon delimiter.');
  }

  const stringLength = Number(bencodedValue.substring(cursor, delimiterPosition));
  cursor += stringLength.toString().length + 1;

  const value = bencodedValue.substring(cursor, cursor + stringLength);
  cursor += value.length;

  return { value, newCursor: cursor };
}

function parseLists(bencodedValue, offset = 0) {
  let cursor = offset;
  cursor++; // skip first character since we've already read it previously

  // determine if this is a string or an integer
  const values = [];

  do {
    const currentChar = bencodedValue.charAt(cursor);

    if (isNaN(currentChar)) {
      if (currentChar === 'i') {
        const { value, newCursor } = parseNumber(bencodedValue, cursor);
        cursor = newCursor;
        values.push(value);
      }
      if (currentChar === 'l') {
        const { values: nestedValues, newCursor } = parseLists(bencodedValue, cursor);
        values.push(nestedValues);
        cursor = newCursor;
      }

      if (currentChar === 'e') {
        // terminator char found at the end of the list
        cursor++;
        break;
      }
    } else {
      const { value, newCursor } = parseString(bencodedValue, cursor);
      cursor = newCursor;
      values.push(value);
    }
  } while (cursor < bencodedValue.length);

  return { values, newCursor: cursor };
}

function decodeBencode(bencodedValue) {
  const [firstCharacter] = bencodedValue;
  const lastCharacter = bencodedValue.charAt(bencodedValue.length - 1);

  if (isNaN(firstCharacter)) {
    if (firstCharacter === 'i') {
      const { value } = parseNumber(bencodedValue, 0);
      return value;
    }
    if (firstCharacter === 'l' && lastCharacter === 'e') {
      const { values } = parseLists(bencodedValue, 0);
      return values;
    }

    throw new Error(`Invalid value ${bencodedValue}. Unsupported encoding.`);
  } else {
    const { value } = parseString(bencodedValue, 0);
    return value;
  }
}

module.exports = { decodeBencode };
