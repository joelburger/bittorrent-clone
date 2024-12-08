const { decodeBencode } = require('./decoder');
const { bencode } = require('./encoder');

test('bencode a string', () => {
  // act
  const actual = bencode('hello12345');

  // assert
  expect(actual).toBe('10:hello12345');
});

test('bencode a positive integer', () => {
  // act
  const actual = bencode(54);

  // assert
  expect(actual).toEqual('i54e');
});

test('bencode a negative integer', () => {
  // act
  const actual = bencode(-54);

  // assert
  expect(actual).toEqual('i-54e');
});

test('throws an error when the data type is unsupported', () => {
  expect(() => bencode(false).toThrow('Unsupported data type'));
});

test('bencode a  list with a single number value', () => {
  // act
  const actual = bencode([58]);

  // assert
  expect(actual).toEqual('li58ee');
});

test('bencode a list with a single string value', () => {
  // act
  const actual = bencode(['hello']);

  // assert
  expect(actual).toEqual('l5:helloe');
});

test('decodes an empty bencoded list', () => {
  // act
  const actual = bencode([]);

  // assert
  expect(actual).toEqual('le');
});

test('bencode  a nested list', () => {
  // act
  const actual = bencode([[816, 'blueberry']]);

  // assert
  expect(actual).toEqual('lli816e9:blueberryee');
});

test('bencode a dictionary', () => {
  // act
  const actual = bencode({ foo: 'bar', hello: 52 });

  // assert
  expect(actual).toEqual('d3:foo3:bar5:helloi52ee');
});

test('bencode a dictionary with a nested dictionary', () => {
  // act
  const actual = bencode({
    inner_dict: { key1: 'value1', key2: 42, list_key: ['item1', 'item2', 3] },
  });

  // assert
  expect(actual).toEqual('d10:inner_dictd4:key16:value14:key2i42e8:list_keyl5:item15:item2i3eeee');
});
