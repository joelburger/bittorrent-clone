function parseInteger(bencodedValue, offset) {
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

function parseList(bencodedValue, offset = 0) {
  let cursor = offset;
  cursor++; // skip first character since we've already read it previously

  const values = [];

  do {
    const currentChar = bencodedValue.charAt(cursor);

    if (isNaN(currentChar)) {
      if (currentChar === 'i') {
        const { value, newCursor } = parseInteger(bencodedValue, cursor);
        cursor = newCursor;
        values.push(value);
      }
      if (currentChar === 'l') {
        const { values: nestedValues, newCursor } = parseList(bencodedValue, cursor);
        cursor = newCursor;
        values.push(nestedValues);
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

function parseDictionary(bencodedValue, offset) {
  let cursor = offset;
  cursor++; // skip first character since we've already read it previously

  const values = {};
  do {
    let currentChar = bencodedValue.charAt(cursor);

    // get key
    let dictionaryKey;
    if (isNaN(currentChar)) {
      if (currentChar === 'e') {
        cursor++;
        break;
      } else {
        throw new Error(`Invalid key encoding found for dictionary: ${bencodedValue}`);
      }
    } else {
      const { value, newCursor } = parseString(bencodedValue, cursor);
      cursor = newCursor;
      dictionaryKey = value;
    }

    currentChar = bencodedValue.charAt(cursor);

    let dictionaryValue;
    if (isNaN(currentChar)) {
      if (currentChar === 'i') {
        const { value, newCursor } = parseInteger(bencodedValue, cursor);
        cursor = newCursor;
        dictionaryValue = value;
      } else if (currentChar === 'l') {
        const { values, newCursor } = parseList(bencodedValue, cursor);
        cursor = newCursor;
        dictionaryValue = values;
      } else if (currentChar === 'd') {
        const { values, newCursor } = parseDictionary(bencodedValue, cursor);
        cursor = newCursor;
        dictionaryValue = values;
      } else {
        throw new Error(`Invalid value encoding found for dictionary: ${bencodedValue}`);
      }
    } else {
      const { value, newCursor } = parseString(bencodedValue, cursor);
      cursor = newCursor;
      dictionaryValue = value;
    }
    values[dictionaryKey] = dictionaryValue;
  } while (cursor < bencodedValue.length);
  return { values, newCursor: cursor };
}

function decodeBencode(bencodedValue) {
  const [firstCharacter] = bencodedValue;
  const lastCharacter = bencodedValue.charAt(bencodedValue.length - 1);

  if (isNaN(firstCharacter)) {
    if (firstCharacter === 'i') {
      const { value } = parseInteger(bencodedValue, 0);
      return value;
    }
    if (firstCharacter === 'l' && lastCharacter === 'e') {
      const { values } = parseList(bencodedValue, 0);
      return values;
    }

    if (firstCharacter === 'd') {
      const { values } = parseDictionary(bencodedValue, 0);

      return values;
    }

    throw new Error(`Invalid value ${bencodedValue}. Unsupported encoding.`);
  } else {
    const { value } = parseString(bencodedValue, 0);
    return value;
  }
}

module.exports = { decodeBencode };
