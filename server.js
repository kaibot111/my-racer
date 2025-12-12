const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Serve ALL files in the current folder
app.use(express.static(__dirname));

// --- 1. GENERATE THE SHARED CITY ON THE SERVER ---
const cityLayout = [];
const ROWS = 20;
const COLS = 20;
const BLOCK_SIZE = 80; // Space between building centers

// Generate the map ONCE so it's the same for everyone
for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
        // Calculate grid position, centered around 0,0
        const x = (r * BLOCK_SIZE) - ((ROWS * BLOCK_SIZE) / 2);
        const z = (c * BLOCK_SIZE) - ((COLS * BLOCK_SIZE) / 2);

        // Random Dimensions
        const width = 20 + Math.random() * 40;  // 20 to 60
        const depth = 20 + Math.random() * 40;  // 20 to 60
        const height = 30 + Math.random() * 120; // 30 to 150 (Varied heights)

        // Random Color (store as hex string)
        const grayScale = Math.random() * 0.5 + 0.1;
        // Convert RGB to Hex Integer
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

    // Send the Map to the new player immediately
    socket.emit('cityMap', cityLayout);

    // Spawn player in a "Street" (Offset by half block size)
    // This prevents spawning inside a building
    const randomRow = Math.floor(Math.random() * ROWS);
    const randomCol = Math.floor(Math.random() * COLS);
    
    // Calculate spawn coordinates (in the gap between buildings)
    const spawnX = (randomRow * BLOCK_SIZE) - ((ROWS * BLOCK_SIZE) / 2) + (BLOCK_SIZE / 2);
    const spawnZ = (randomCol * BLOCK_SIZE) - ((COLS * BLOCK_SIZE) / 2) + (BLOCK_SIZE / 2);

    players[socket.id] = {
        x: spawnX, 
        z: spawnZ, 
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
        console.log('Driver left:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
