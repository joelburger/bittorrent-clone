function parseLInk(magnetLink) {
  // These are the query parameters in a magnet link:
  //
  // xt: urn:btih: followed by the 40-char hex-encoded info hash (example: urn:btih:ad42ce8109f54c99613ce38f9b4d87e70f24a165)
  // dn: The name of the file to be downloaded (example: magnet1.gif)
  // tr: The tracker URL (example: http://bittorrent-test-tracker.codecrafters.io/announce)
  // sample
  // //magnet:?xt=urn:btih:ad42ce8109f54c99613ce38f9b4d87e70f24a165&dn=magnet1.gif&tr=http%3A%2F%2Fbittorrent-test-tracker.codecrafters.io%2Fannounce
  const url = new URL(magnetLink);
  const params = new URLSearchParams(url.search);

  const infoHash = params.get('xt')?.split(':').pop();
  const fileName = params.get('dn');
  const trackerUrl = params.get('tr');

  return { infoHash, fileName, trackerUrl };
}

async function handleCommand(parameters) {
  const [, magnetLink] = parameters;

  const { infoHash, fileName, trackerUrl } = parseLInk(magnetLink);
  console.log(`Tracker URL: ${trackerUrl}`);
  console.log(`Info Hash: ${infoHash}`);
}

module.exports = handleCommand;
