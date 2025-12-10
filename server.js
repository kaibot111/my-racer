const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// CHANGE: Serve files from the root directory (__)
app.use(express.static(__dirname));

// Route for the homepage
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Game State
const players = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create a new player
    players[socket.id] = {
        id: socket.id,
        x: 400,
        y: 300,
        angle: 0,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
    };

    // Send current players to the new connection
    socket.emit('currentPlayers', players);

    // Broadcast new player to others
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Handle movement
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].angle = movementData.angle;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
