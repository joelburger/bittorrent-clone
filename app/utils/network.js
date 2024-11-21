const { Socket } = require('net');

async function connect(host, port, dataEventHandler) {
  const socket = new Socket();

  socket.on('data', dataEventHandler);

  socket.on('close', () => {
    console.log('Connection closed');
  });

  socket.on('connect', () => {
    console.log(`Connected to ${socket.remoteAddress}:${socket.remotePort}`);
  });

  socket.on('end', () => {
    console.log('Connection end');
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
