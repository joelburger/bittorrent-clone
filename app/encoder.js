function encode(value) {
  if (typeof value === 'string') {
    return `${value.length}:${value}`;
  } else if (typeof value === 'number') {
    return `i${value}e`;
  } else if (Array.isArray(value)) {
    return `l${value.map(encode).join('')}e`;
  } else if (typeof value === 'object' && value !== null) {
    return `d${Object.entries(value)
      .map(([k, v]) => `${encode(k)}${encode(v)}`)
      .join('')}e`;
  } else {
    throw new Error('Unsupported value type');
  }
}

module.exports = {
  encode,
};
