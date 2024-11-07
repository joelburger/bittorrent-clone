const { decodeBencode } = require('./decoder');

test('decodes a bencoded string', () => {
  // act
  const actual = decodeBencode(Buffer.from('10:hello12345')).toString();

  // assert
  expect(actual).toBe('hello12345');
});

test('decodes a bencoded positive integer', () => {
  // act
  const actual = decodeBencode(Buffer.from('i54e'));

  // assert
  expect(actual).toEqual(54);
});

test('decodes a bencoded negative integer', () => {
  // act
  const actual = decodeBencode(Buffer.from('i-54e'));

  // assert
  expect(actual).toEqual(-54);
});

test('throws an error when the encoding is unsupported', () => {
  expect(() => decodeBencode(Buffer.from('a54e'))).toThrow('Invalid value a54e. Unsupported encoding.');
});

test('decodes a bencoded list with a single number value', () => {
  // act
  const actual = decodeBencode(Buffer.from('li58ee'));

  // assert
  expect(actual).toEqual([58]);
});

test('decodes a bencoded list with a single string value', () => {
  // act
  const actual = decodeBencode(Buffer.from('l5:helloe'));

  // assert
  expect(actual).toEqual([Buffer.from('hello')]);
});

test('decodes a bencoded list with two values: string and number', () => {
  // act
  const actual = decodeBencode(Buffer.from('l5:helloi721ee'));

  // assert
  expect(actual).toEqual([Buffer.from('hello'), 721]);
});

test('decodes a bencoded list with two values: number and string', () => {
  // act
  const actual = decodeBencode(Buffer.from('li123e3:doge'));

  // assert
  expect(actual).toEqual([123, Buffer.from('dog')]);
});

test('decodes a bencoded list with two number values', () => {
  // act
  const actual = decodeBencode(Buffer.from('li721ei1842ee'));

  // assert
  expect(actual).toEqual([721, 1842]);
});

test('decodes a bencoded list with multiple values', () => {
  // act
  const actual = decodeBencode(Buffer.from('li721ei1842e12:civilisationi12345678e4:moone'));

  // assert
  expect(actual).toEqual([721, 1842, Buffer.from('civilisation'), 12345678, Buffer.from('moon')]);
});

test('decodes an empty bencoded list', () => {
  // act
  const actual = decodeBencode(Buffer.from('le'));

  // assert
  expect(actual).toEqual([]);
});

test('decodes a nested list', () => {
  // act
  const actual = decodeBencode(Buffer.from('lli816e9:blueberryee'));

  // assert
  expect(actual).toEqual([[816, Buffer.from('blueberry')]]);
});

test('decodes a dictionary', () => {
  // act
  const actual = decodeBencode(Buffer.from('d3:foo3:bar5:helloi52ee'));

  // assert
  expect(actual).toEqual({ foo: Buffer.from('bar'), hello: 52 });
});

test('decodes a dictionary with a nested dictionary', () => {
  // act
  const actual = decodeBencode(Buffer.from('d10:inner_dictd4:key16:value14:key2i42e8:list_keyl5:item15:item2i3eeee'));

  // assert
  expect(actual).toEqual({
    inner_dict: { key1: Buffer.from('value1'), key2: 42, list_key: [Buffer.from('item1'), Buffer.from('item2'), 3] },
  });
});
