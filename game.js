// --- Game Config ---
const SPEED = 0.5;
const TURN_SPEED = 0.05;
const TRACK_SCALE = 80; // Size of the figure 8

// --- Setup Three.js ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue
scene.fog = new THREE.Fog(0x87CEEB, 10, 150);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 50, 0);
scene.add(dirLight);

// --- The Ground ---
const groundGeo = new THREE.PlaneGeometry(500, 500);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x228B22, flatShading: true }); // Low poly grass
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// --- Multiplayer Setup ---
const socket = io();
let otherPlayers = {}; // Stores the 3D meshes of opponents
let myCar; 
let myId;

// --- Helper: Create a Low Poly Car ---
function createCarMesh(colorHex) {
    const carGroup = new THREE.Group();

    // Body (Low poly box)
    const bodyGeo = new THREE.BoxGeometry(2, 1, 4);
    const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex, flatShading: true });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    carGroup.add(body);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8); // 8 segments for low-poly look
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x333333, flatShading: true });
    
    const wheels = [
        { x: 1.1, z: 1.2 }, { x: -1.1, z: 1.2 },
        { x: 1.1, z: -1.2 }, { x: -1.1, z: -1.2 }
    ];

    wheels.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, 0.5, pos.z);
        carGroup.add(wheel);
    });

    return carGroup;
}

// --- Create the Track (Figure 8 Walls) ---
const wallGeo = new THREE.BoxGeometry(2, 2, 2);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });
const walls = []; // Store for collision

function createWall(x, z) {
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(x, 1, z);
    scene.add(wall);
    walls.push(wall); // Add to collision list
}

// Generate Figure 8 using Math (Lemniscate)
// Parametric equation: x = a * cos(t) / (1 + sin^2(t)), z = a * sin(t) * cos(t) / (1 + sin^2(t))
const steps = 100;
const trackWidth = 8; 

for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    
    // Calculate center line of track
    const denom = 1 + Math.sin(t) * Math.sin(t);
    const cx = (TRACK_SCALE * Math.cos(t)) / denom;
    const cz = (TRACK_SCALE * Math.sin(t) * Math.cos(t)) / denom;

    // We need walls on inside and outside. 
    // Simplified: Just place blocks slightly offset.
    // A robust way creates normal vectors, but for simplicity, we just place scattered barriers
    // following the shape.
    
    // Inner Wall (approximate)
    createWall(cx * 0.85, cz * 0.85); 
    // Outer Wall (approximate)
    createWall(cx * 1.15, cz * 1.15);
}

// --- Socket Events ---

// 1. Initial Load of current players
socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        if (id === socket.id) {
            // Create My Car
            myCar = createCarMesh(players[id].color);
            scene.add(myCar);
            myId = id;
            
            // Set camera to follow
            camera.position.set(0, 10, -15);
            camera.lookAt(myCar.position);
        } else {
            // Create Opponent Car
            const p = players[id];
            const opponent = createCarMesh(p.color);
            opponent.position.set(p.x, 0, p.z);
            opponent.rotation.y = p.rot;
            scene.add(opponent);
            otherPlayers[id] = opponent;
        }
    });
});

// 2. New Player Joined
socket.on('newPlayer', (data) => {
    const opponent = createCarMesh(data.player.color);
    opponent.position.set(data.player.x, 0, data.player.z);
    opponent.rotation.y = data.player.rot;
    scene.add(opponent);
    otherPlayers[data.id] = opponent;
});

// 3. Player Moved
socket.on('playerMoved', (data) => {
    if (otherPlayers[data.id]) {
        otherPlayers[data.id].position.x = data.x;
        otherPlayers[data.id].position.z = data.z;
        otherPlayers[data.id].rotation.y = data.rot;
    }
});

// 4. Player Left
socket.on('playerDisconnected', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id]);
        delete otherPlayers[id];
    }
});

// --- Input Handling ---
const keys = { w: false, a: false, s: false, d: false };

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
    if (e.key === "ArrowUp") keys.w = true;
    if (e.key === "ArrowDown") keys.s = true;
    if (e.key === "ArrowLeft") keys.a = true;
    if (e.key === "ArrowRight") keys.d = true;
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
    if (e.key === "ArrowUp") keys.w = false;
    if (e.key === "ArrowDown") keys.s = false;
    if (e.key === "ArrowLeft") keys.a = false;
    if (e.key === "ArrowRight") keys.d = false;
});

// --- Collision Detection (Simple Box Check) ---
function checkCollision(nextX, nextZ) {
    const carBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(nextX, 1, nextZ), 
        new THREE.Vector3(2, 2, 4)
    );
    
    for (let wall of walls) {
        const wallBox = new THREE.Box3().setFromObject(wall);
        if (carBox.intersectsBox(wallBox)) {
            return true; // Collision detected
        }
    }
    return false;
}

// --- Game Loop ---
function animate() {
    requestAnimationFrame(animate);

    if (myCar) {
        let moveStep = 0;
        let rotStep = 0;

        // Calculate potential new position
        if (keys.w) moveStep = SPEED;
        if (keys.s) moveStep = -SPEED;
        if (keys.a) rotStep = TURN_SPEED;
        if (keys.d) rotStep = -TURN_SPEED;

        // Apply Rotation
        myCar.rotation.y += rotStep;

        // Calculate forward vector based on rotation
        const nextX = myCar.position.x + Math.sin(myCar.rotation.y) * moveStep;
        const nextZ = myCar.position.z + Math.cos(myCar.rotation.y) * moveStep;

        // Move only if no collision
        if (!checkCollision(nextX, nextZ)) {
            myCar.position.x = nextX;
            myCar.position.z = nextZ;
        }

        // Camera Follow
        const relativeCameraOffset = new THREE.Vector3(0, 8, -15);
        const cameraOffset = relativeCameraOffset.applyMatrix4(myCar.matrixWorld);
        camera.position.lerp(cameraOffset, 0.1);
        camera.lookAt(myCar.position);

        // Send Update to Server (throttled slightly by frame rate is okay for demo)
        if (moveStep !== 0 || rotStep !== 0) {
            socket.emit('playerMovement', {
                x: myCar.position.x,
                z: myCar.position.z,
                rot: myCar.rotation.y
            });
        }
    }

    renderer.render(scene, camera);
}

animate();

// Handle Window Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
