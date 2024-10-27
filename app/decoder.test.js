const { decodeBencode } = require('./decoder');

test('decodes a simple bencoded string', () => {
  expect(decodeBencode('5:hello')).toBe('hello');
});

test('decodes a longer bencoded string', () => {
  expect(decodeBencode('10:hello12345')).toBe('hello12345');
});

test('throws an error for invalid encoded value', () => {
  expect(() => decodeBencode('5hello')).toThrow('Invalid encoded value');
});

test('throws an error for unsupported types', () => {
  expect(() => decodeBencode('i123e')).toThrow('Only strings are supported at the moment');
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
