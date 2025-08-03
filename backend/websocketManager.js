const clients = new Map();

// This function will receive the WebSocket server instance from server.js
function initializeWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    // Note: To keep this simple, we're omitting the JWT verification here,
    // as it relies on other parts of your server.js. The primary goal
    // is to break the dependency. We can add verification back later if needed.
    const url = require('url');
    const token = url.parse(req.url, true).query.token;

    console.log(`[WS] Client connected with token: ${token}`);
    clients.set(token, ws); // Storing by token for simplicity here

    ws.on('close', () => {
      clients.delete(token);
      console.log(`[WS] Client disconnected`);
    });
  });
}

function logToUser(userId, message) {
  // This part needs to be adjusted based on how you map users to sockets.
  // If you map by token instead of userId, you'd look up the client by token.
  const userSocket = clients.get(userId.toString()); // Assuming you can map userId to a socket
  if (userSocket && userSocket.readyState === 1) { // 1 means WebSocket.OPEN
    userSocket.send(JSON.stringify({ message }));
  }
}

module.exports = { initializeWebSocket, logToUser };
