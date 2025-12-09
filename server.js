const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- FLAT STRUCTURE CONFIGURATION ---
// This tells the server: "When someone visits the site, give them the index.html that is right next to me."
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
// ------------------------------------

let players = {};

io.on('connection', (socket) => {
    console.log('New racer joined:', socket.id);

    players[socket.id] = { 
        x: 0, 
        z: 0, 
        angle: Math.PI, 
        color: Math.random() * 0xffffff 
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
            players[socket.id].angle = movementData.angle;
            
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                x: movementData.x,
                z: movementData.z,
                angle: movementData.angle
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
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
