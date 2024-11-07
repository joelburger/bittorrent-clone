const { Socket } = require('net');

function createSocket(dataEventHandler) {
  const socket = new Socket();

  socket.on('data', dataEventHandler);

  socket.on('close', () => {
    console.log('Connection closed');
  });

  socket.on('connect', () => {
    console.log(`Connected to ${socket.remoteAddress}:${socket.remotePort}`);
  });

  return socket;
}

module.exports = {
  createSocket,
};
