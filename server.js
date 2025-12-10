const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Store players: { socketId: { x, z, rot, color } }
let players = {};

io.on('connection', (socket) => {
    console.log('A racer connected:', socket.id);

    // Assign a random color to the new racer
    players[socket.id] = {
        x: 0,
        z: 0,
        rot: 0,
        color: '#' + Math.floor(Math.random()*16777215).toString(16)
    };

    // Send the current list of players to the new person
    socket.emit('currentPlayers', players);

    // Tell everyone else a new racer has joined
    socket.broadcast.emit('newPlayer', { 
        id: socket.id, 
        player: players[socket.id] 
    });

    // When a player moves, update data and tell everyone else
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].z = movementData.z;
            players[socket.id].rot = movementData.rot;
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                x: movementData.x,
                z: movementData.z,
                rot: movementData.rot
            });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Racer disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
