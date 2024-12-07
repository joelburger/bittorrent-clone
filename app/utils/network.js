const { Socket } = require('net');

async function connect(host, port, dataEventHandler) {
  const socket = new Socket();
  let startTime;

  socket.on('data', dataEventHandler);

  socket.on('close', () => {
    //console.log(`Connection closed after ${Date.now() - startTime} ms`);
  });

  socket.on('connect', () => {
    //console.log(`Connected to ${socket.remoteAddress}:${socket.remotePort}`);
    startTime = Date.now();
  });

  socket.on('end', () => {
    //console.log('Connection end');
  });

  await socket.connect({ host, port });

  return socket;
}

function disconnect(socket) {
  if (socket) {
    socket.end();
  }
}

module.exports = {
  connect,
  disconnect,
};
