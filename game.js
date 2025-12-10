const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

canvas.width = 800;
canvas.height = 600;

let players = {};
const speed = 0;
const maxSpeed = 6;
const friction = 0.96;
const rotationSpeed = 0.07;

const localPlayer = {
    x: 400,
    y: 300,
    angle: -Math.PI / 2,
    velocity: 0,
    id: null
};

const keys = {
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
    w: false, s: false, a: false, d: false
};

window.addEventListener('keydown', (e) => { if(keys.hasOwnProperty(e.key)) keys[e.key] = true; });
window.addEventListener('keyup', (e) => { if(keys.hasOwnProperty(e.key)) keys[e.key] = false; });

// --- TRACK & WALL GENERATION ---
const trackCanvas = document.createElement('canvas');
trackCanvas.width = canvas.width;
trackCanvas.height = canvas.height;
const trackCtx = trackCanvas.getContext('2d');

function drawTrack(context) {
    // 1. Grass (The Wall Color)
    context.fillStyle = '#2a5d2a'; 
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);

    // 2. Road Setup
    context.lineCap = 'round';
    context.lineJoin = 'round';
    
    // 3. Road Border (Safety margin)
    context.strokeStyle = '#888'; 
    context.lineWidth = 130;
    context.beginPath();
    context.arc(400, 200, 100, 0, Math.PI * 2); 
    context.arc(400, 400, 100, 0, Math.PI * 2); 
    context.stroke();

    // 4. Asphalt (The Safe Zone)
    context.strokeStyle = '#555'; 
    context.lineWidth = 110;
    context.beginPath();
    context.arc(400, 200, 100, 0, Math.PI * 2);
    context.arc(400, 400, 100, 0, Math.PI * 2);
    context.stroke();

    // 5. Start Line
    context.strokeStyle = '#fff';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(350, 300);
    context.lineTo(450, 300);
    context.stroke();
}

drawTrack(trackCtx);

function checkCollision(x, y) {
    // We check the pixel color on the track canvas.
    // If it is GREEN (Grass), we hit a wall.
    const pixel = trackCtx.getImageData(x, y, 1, 1).data;
    // Green component > Red component = Grass
    if (pixel[1] > pixel[0] + 20) {
        return true; 
    }
    return false;
}

// --- SOCKET EVENTS ---
socket.on('connect', () => { localPlayer.id = socket.id; });

socket.on('currentPlayers', (serverPlayers) => {
    players = serverPlayers;
    if(players[socket.id]) localPlayer.color = players[socket.id].color;
});

socket.on('newPlayer', (playerInfo) => { players[playerInfo.id] = playerInfo; });

socket.on('playerMoved', (playerInfo) => {
    if (playerInfo.id !== localPlayer.id) players[playerInfo.id] = playerInfo;
});

socket.on('playerDisconnected', (id) => { delete players[id]; });

// --- GAME LOOP ---
function update() {
    if (keys.ArrowUp || keys.w) localPlayer.velocity += 0.2;
    if (keys.ArrowDown || keys.s) localPlayer.velocity -= 0.2;
    if (keys.ArrowLeft || keys.a) localPlayer.angle -= rotationSpeed;
    if (keys.ArrowRight || keys.d) localPlayer.angle += rotationSpeed;

    localPlayer.velocity *= friction;

    const nextX = localPlayer.x + Math.cos(localPlayer.angle) * localPlayer.velocity;
    const nextY = localPlayer.y + Math.sin(localPlayer.angle) * localPlayer.velocity;

    if (checkCollision(nextX, nextY)) {
        localPlayer.velocity *= -0.5; // Bounce off wall
    } else {
        localPlayer.x = nextX;
        localPlayer.y = nextY;
    }

    if (localPlayer.id) {
        socket.emit('playerMovement', { x: localPlayer.x, y: localPlayer.y, angle: localPlayer.angle });
        if (players[localPlayer.id]) {
            players[localPlayer.id].x = localPlayer.x;
            players[localPlayer.id].y = localPlayer.y;
            players[localPlayer.id].angle = localPlayer.angle;
        }
    }
}

function drawCar(x, y, angle, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    
    // Draw Polygon Triangle
    ctx.beginPath();
    ctx.moveTo(15, 0);   
    ctx.lineTo(-10, 10); 
    ctx.lineTo(-5, 0);   
    ctx.lineTo(-10, -10);
    ctx.closePath();
    
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(trackCanvas, 0, 0); // Background
    for (let id in players) {
        const p = players[id];
        drawCar(p.x, p.y, p.angle, p.color);
    }
    requestAnimationFrame(render);
}

setInterval(update, 1000 / 60);
render();
