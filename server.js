const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the game file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- SERVER SIDE PHYSICS CONSTANTS ---
const GAME_TICK_RATE = 60; // Calculate 60 times per second
const MAX_SPEED = 1.2;
const ACCELERATION = 0.02;
const FRICTION = 0.98;
const TURN_SPEED = 0.05;

// Game State
let players = {};

io.on('connection', (socket) => {
    console.log('New racer joined:', socket.id);

    // Create player with default values
    players[socket.id] = { 
        x: (Math.random() * 10) - 5, // Random spawn offset
        z: (Math.random() * 10) - 5, 
        angle: Math.PI, 
        speed: 0,
        color: Math.random() * 0xffffff,
        inputs: { up: false, down: false, left: false, right: false }
    };

    // Send the initial state to the new player
    socket.emit('init', { id: socket.id, players: players });

    // Handle Input from Clients
    socket.on('input', (data) => {
        if (players[socket.id]) {
            players[socket.id].inputs = data;
        }
    });

    socket.on('disconnect', () => {
        console.log('Racer left:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// --- THE GAME LOOP ---
// This runs 60 times a second to calculate movement for EVERYONE
setInterval(() => {
    const pack = {}; // Data packet to send to clients

    for (const id in players) {
        const p = players[id];
        const input = p.inputs;

        // 1. Calculate Speed
        if (input.up) p.speed += ACCELERATION;
        if (input.down) p.speed -= ACCELERATION;
        p.speed *= FRICTION;

        // 2. Calculate Turning
        if (Math.abs(p.speed) > 0.01) {
            const dir = p.speed > 0 ? 1 : -1;
            if (input.left) p.angle += TURN_SPEED * dir;
            if (input.right) p.angle -= TURN_SPEED * dir;
        }

        // 3. Update Position (Math.sin/cos)
        p.x += Math.sin(p.angle) * p.speed;
        p.z += Math.cos(p.angle) * p.speed;

        // Add to packet
        pack[id] = {
            x: p.x,
            z: p.z,
            angle: p.angle,
            color: p.color
        };
    }

    // Send the calculated positions to EVERYONE
    io.emit('stateUpdate', pack);

}, 1000 / GAME_TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
