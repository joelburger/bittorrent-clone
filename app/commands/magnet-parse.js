async function handleCommand(parameters) {
  const [, magnetLink] = parameters;

  console.log('link', magnetLink);
}

module.exports = handleCommand;
