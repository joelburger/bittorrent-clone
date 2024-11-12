const { Socket } = require('net');

async function connect(host, port) {
  const socket = new Socket();

  socket.on('close', () => {
    console.log('Connection closed');
  });

  socket.on('connect', () => {
    console.log(`Connected to ${socket.remoteAddress}:${socket.remotePort}`);
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
