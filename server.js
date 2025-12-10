const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// --- FIX: Serve ALL files in the current folder ---
// This tells the server: "Look in this same folder for index.html or game.js"
app.use(express.static(__dirname));

// --- Multiplayer Logic ---
let players = {};

io.on('connection', (socket) => {
    console.log('New racer joined:', socket.id);

    players[socket.id] = {
        x: 0, 
        z: 0, 
        rot: 0, 
        color: '#' + Math.floor(Math.random()*16777215).toString(16)
    };

    socket.emit('currentPlayers', players);

    socket.broadcast.emit('newPlayer', { 
        id: socket.id, 
        player: players[socket.id] 
    });

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

    socket.on('disconnect', () => {
        console.log('Racer left:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
