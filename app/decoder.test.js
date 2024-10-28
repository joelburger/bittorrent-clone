const { decodeBencode } = require('./decoder');

test('decodes a simple bencoded string', () => {
  expect(decodeBencode('5:hello')).toBe('hello');
});

test('decodes a longer bencoded string', () => {
  expect(decodeBencode('10:hello12345')).toBe('hello12345');
});

test('decodes a bencoded positive integer', () => {
  // act
  const actual = decodeBencode('i54e');

  // assert
  expect(actual).toEqual(54);
});

test('decodes a bencoded negative integer', () => {
  // act
  const actual = decodeBencode('i-54e');

  // assert
  expect(actual).toEqual(-54);
});

test('throws an error when the encoding is unsupported', () => {
  expect(() => decodeBencode('a54e')).toThrow('Invalid value a54e. Unsupported encoding.');
});

test('decodes a bencoded list with a single number value', () => {
  // act
  const actual = decodeBencode('li58ee');

  // assert
  expect(actual).toEqual([58]);
});

test('decodes a bencoded list with a single string value', () => {
  // act
  const actual = decodeBencode('l5:helloe');

  // assert
  expect(actual).toEqual(['hello']);
});

test('decodes a bencoded list with two values: string and number', () => {
  // act
  const actual = decodeBencode('l5:helloi721ee');

  // assert
  expect(actual).toEqual(['hello', 721]);
});

test('decodes a bencoded list with two values: number and string', () => {
  // act
  const actual = decodeBencode('li123e3:doge');

  // assert
  expect(actual).toEqual([123, 'dog']);
});

test('decodes a bencoded list with two number values', () => {
  // act
  const actual = decodeBencode('li721ei1842ee');

  // assert
  expect(actual).toEqual([721, 1842]);
});

test('decodes a bencoded list with multiple values', () => {
  // act
  const actual = decodeBencode('li721ei1842e12:civilisationi12345678e4:moone');

  // assert
  expect(actual).toEqual([721, 1842, 'civilisation', 12345678, 'moon']);
});

test('decodes an empty bencoded list', () => {
  // act
  const actual = decodeBencode('le');

  // assert
  expect(actual).toEqual([]);
});
