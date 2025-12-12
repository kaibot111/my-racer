const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Serve ALL files in the current folder
app.use(express.static(__dirname));

// --- 1. GENERATE THE SHARED CITY ---
const cityLayout = [];
const ROWS = 20;
const COLS = 20;
const BLOCK_SIZE = 80; 

for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
        
        // CHECK: Is this the center? 
        // We skip rows/cols 9 and 10 to make a 2x2 empty plaza at (0,0)
        if ((r === 9 || r === 10) && (c === 9 || c === 10)) {
            continue; // Do not build here!
        }

        const x = (r * BLOCK_SIZE) - ((ROWS * BLOCK_SIZE) / 2) + (BLOCK_SIZE / 2);
        const z = (c * BLOCK_SIZE) - ((COLS * BLOCK_SIZE) / 2) + (BLOCK_SIZE / 2);

        // Random Dimensions
        const width = 20 + Math.random() * 50; 
        const depth = 20 + Math.random() * 50;
        const height = 30 + Math.random() * 120;

        // Random Color
        const grayScale = Math.random() * 0.5 + 0.1;
        const rVal = Math.floor(grayScale * 255);
        const gVal = Math.floor(grayScale * 255);
        const bVal = Math.floor((grayScale + 0.1) * 255);
        const color = (rVal << 16) | (gVal << 8) | bVal;

        cityLayout.push({ x, z, width, depth, height, color });
    }
}

// --- 2. PLAYER LOGIC ---
let players = {};

io.on('connection', (socket) => {
    console.log('Driver connected:', socket.id);

    // Send the Map
    socket.emit('cityMap', cityLayout);

    // --- SPAWN AT (0,0) ---
    // We add a tiny random offset (0.1) just so textures don't flicker 
    // if two people join at the exact same millisecond.
    players[socket.id] = {
        x: 0, 
        z: 0, 
        rot: 0, // Face North
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
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
