const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// --- 1. Serve the specific files directly ---

// When user visits the URL, give them the HTML
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// When the HTML asks for the game logic, give them the JS
app.get('/game.js', (req, res) => {
    res.sendFile(__dirname + '/game.js');
});

// --- 2. Multiplayer Logic ---

// Store players: { socketId: { x, z, rot, color } }
let players = {};

io.on('connection', (socket) => {
    console.log('New racer joined:', socket.id);

    // Create new player data
    players[socket.id] = {
        x: 0,
        z: 0,
        rot: 0,
        color: '#' + Math.floor(Math.random()*16777215).toString(16)
    };

    // Send existing players to the new guy
    socket.emit('currentPlayers', players);

    // Tell everyone else about the new guy
    socket.broadcast.emit('newPlayer', { 
        id: socket.id, 
        player: players[socket.id] 
    });

    // Handle Movement
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

    // Handle Disconnect
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
