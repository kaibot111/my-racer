const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Serve ALL files in the current folder
app.use(express.static(__dirname));

// --- Multiplayer Logic ---
let players = {};
const TRACK_SCALE = 200; // Must match game.js

io.on('connection', (socket) => {
    console.log('New racer joined:', socket.id);

    // --- NEW: Calculate random spawn ON THE TRACK ---
    // We use the same math as the track generation to find a safe spot
    const t = Math.random() * Math.PI * 2;
    const denom = 1 + Math.sin(t) * Math.sin(t);
    const spawnX = (TRACK_SCALE * Math.cos(t)) / denom;
    const spawnZ = (TRACK_SCALE * Math.sin(t) * Math.cos(t)) / denom;

    // Calculate facing rotation (look ahead on track)
    // A simple approximation is acceptable for spawning
    const spawnRot = -t + Math.PI/2; 

    players[socket.id] = {
        x: spawnX, 
        z: spawnZ, 
        rot: spawnRot, 
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
