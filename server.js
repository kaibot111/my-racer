const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Allow connections from anywhere (CORS)
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// --- THIS IS THE NEW PART ---
// This tells the server what to show when you visit the URL in your browser
app.get('/', (req, res) => {
    res.send('Race Control Server is online! Use this URL in your game code.');
});
// ----------------------------

let players = {};

io.on('connection', (socket) => {
    console.log('New driver connected:', socket.id);

    // Add new player
    players[socket.id] = { x: 0, z: 0, angle: 0, color: Math.random() * 0xffffff };
    
    // Send current list of players to the new guy
    socket.emit('currentPlayers', players);
    
    // Tell everyone else a new driver joined
    socket.broadcast.emit('newPlayer', { 
        id: socket.id, 
        player: players[socket.id] 
    });

    // Handle Movement Updates
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].z = movementData.z;
            players[socket.id].angle = movementData.angle;
            
            // Broadcast to everyone else
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                x: movementData.x,
                z: movementData.z,
                angle: movementData.angle
            });
        }
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
        console.log('Driver disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Race control listening on port ${PORT}`);
});
