const { parseMagnetLink } = require('../utils/magnet');

async function handleCommand(parameters) {
  const [, magnetLink] = parameters;

  const { infoHash, fileName, trackerUrl } = parseMagnetLink(magnetLink);
  console.log(`Tracker URL: ${trackerUrl}`);
  console.log(`Info Hash: ${infoHash}`);
}

module.exports = handleCommand;
