const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Serve ALL files in the current folder
app.use(express.static(__dirname));

let players = {};

io.on('connection', (socket) => {
    console.log('New driver connected:', socket.id);

    // --- CITY SPAWN LOGIC ---
    // Spawn randomly in a large area (between -150 and 150)
    // We avoid the absolute edges so you don't fall off immediately
    players[socket.id] = {
        x: Math.random() * 300 - 150, 
        z: Math.random() * 300 - 150, 
        rot: Math.random() * Math.PI * 2, 
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
