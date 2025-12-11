// --- Game Constants ---
const SPEED = 0.9;         // Slightly faster for the bigger track
const TURN_SPEED = 0.04;
const TRACK_SCALE = 200;   // 150% Larger Track (Was 90)

// --- Init Three.js ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa0c0ff);
scene.fog = new THREE.Fog(0xa0c0ff, 20, 250); // Increased fog distance

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
sunLight.position.set(100, 200, 100);
sunLight.castShadow = true;
scene.add(sunLight);

// --- Ground ---
// Made ground much larger to accommodate new track size
const groundGeo = new THREE.PlaneGeometry(2000, 2000); 
const groundMat = new THREE.MeshStandardMaterial({ color: 0x3b8c3b, flatShading: true });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// --- Networking Setup ---
const socket = io();
const infoDiv = document.getElementById('info');
let otherPlayers = {};
let myCar;
let myId;

// --- Helper: Build a Polygon Car ---
function createPolyCar(colorHex) {
    const carGroup = new THREE.Group();

    // Chassis
    const chassisGeo = new THREE.BoxGeometry(2.2, 1, 4.5);
    const chassisMat = new THREE.MeshLambertMaterial({ color: colorHex, flatShading: true });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.8;
    carGroup.add(chassis);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(1.8, 0.8, 2.5);
    const cabinMat = new THREE.MeshLambertMaterial({ color: 0x222222, flatShading: true }); 
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.6, -0.2);
    carGroup.add(cabin);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.5, 8); 
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111, flatShading: true });
    
    const positions = [
        { x: 1.2, z: 1.4 }, { x: -1.2, z: 1.4 },
        { x: 1.2, z: -1.4 }, { x: -1.2, z: -1.4 }
    ];

    positions.forEach(p => {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(p.x, 0.6, p.z);
        carGroup.add(w);
    });

    return carGroup;
}

// --- Track & Walls Generation ---
const walls = [];
const wallGeo = new THREE.BoxGeometry(4, 5, 4); // Slightly larger walls
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, flatShading: true }); 

function spawnWall(x, z) {
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.position.set(x, 2.5, z);
    scene.add(w);
    walls.push(w);
}

// Generate Figure-8
// Increased steps to 400 to prevent gaps in walls on the large track
const steps = 400; 

for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const denom = 1 + Math.sin(t) * Math.sin(t);
    
    // Track Center Path
    const cx = (TRACK_SCALE * Math.cos(t)) / denom;
    const cz = (TRACK_SCALE * Math.sin(t) * Math.cos(t)) / denom;

    // Wall Offsets
    // Because the track is bigger, we need wider lanes (factor 1.10 instead of 1.15)
    // Fixed numeric offset helps keep width consistent
    spawnWall(cx * 1.08 + 6, cz * 1.08); 
    spawnWall(cx * 0.92 - 6, cz * 0.92);
}

// --- Socket Handlers ---

socket.on('currentPlayers', (serverPlayers) => {
    infoDiv.innerText = "USE ARROW KEYS OR WASD TO DRIVE";
    Object.keys(serverPlayers).forEach((id) => {
        if (id === socket.id) {
            myId = id;
            myCar = createPolyCar(serverPlayers[id].color);
            // Server now decides where we spawn!
            myCar.position.set(serverPlayers[id].x, 0, serverPlayers[id].z);
            myCar.rotation.y = serverPlayers[id].rot;
            scene.add(myCar);
        } else {
            const p = serverPlayers[id];
            const opCar = createPolyCar(p.color);
            opCar.position.set(p.x, 0, p.z);
            opCar.rotation.y = p.rot;
            scene.add(opCar);
            otherPlayers[id] = opCar;
        }
    });
});

socket.on('newPlayer', (data) => {
    const opCar = createPolyCar(data.player.color);
    opCar.position.set(data.player.x, 0, data.player.z);
    opCar.rotation.y = data.player.rot;
    scene.add(opCar);
    otherPlayers[data.id] = opCar;
});

socket.on('playerMoved', (data) => {
    if (otherPlayers[data.id]) {
        otherPlayers[data.id].position.x = data.x;
        otherPlayers[data.id].position.z = data.z;
        otherPlayers[data.id].rotation.y = data.rot;
    }
});

socket.on('playerDisconnected', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id]);
        delete otherPlayers[id];
    }
});

// --- Inputs ---
const keys = { w: false, a: false, s: false, d: false };

window.addEventListener('keydown', (e) => {
    if (e.key === 'w' || e.key === 'ArrowUp') keys.w = true;
    if (e.key === 's' || e.key === 'ArrowDown') keys.s = true;
    if (e.key === 'a' || e.key === 'ArrowLeft') keys.a = true;
    if (e.key === 'd' || e.key === 'ArrowRight') keys.d = true;
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'ArrowUp') keys.w = false;
    if (e.key === 's' || e.key === 'ArrowDown') keys.s = false;
    if (e.key === 'a' || e.key === 'ArrowLeft') keys.a = false;
    if (e.key === 'd' || e.key === 'ArrowRight') keys.d = false;
});

// --- Physics Check ---
function checkCollision(x, z) {
    const carBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 1, z),
        new THREE.Vector3(2.2, 2, 4.5)
    );

    for (let wall of walls) {
        const wallBox = new THREE.Box3().setFromObject(wall);
        if (carBox.intersectsBox(wallBox)) return true;
    }
    return false;
}

// --- Main Loop ---
function animate() {
    requestAnimationFrame(animate);

    if (myCar) {
        let move = 0;
        let turn = 0;

        if (keys.w) move = SPEED;
        if (keys.s) move = -SPEED;
        if (keys.a) turn = TURN_SPEED;
        if (keys.d) turn = -TURN_SPEED;

        myCar.rotation.y += turn;

        const dx = Math.sin(myCar.rotation.y) * move;
        const dz = Math.cos(myCar.rotation.y) * move;

        const nextX = myCar.position.x + dx;
        const nextZ = myCar.position.z + dz;

        if (!checkCollision(nextX, nextZ)) {
            myCar.position.x = nextX;
            myCar.position.z = nextZ;
        } else {
            // Bounce
            myCar.position.x -= dx * 0.5;
            myCar.position.z -= dz * 0.5;
        }

        // Camera Logic
        const camDist = 25; // Further back for bigger car/track feel
        const camHeight = 12;
        
        const targetX = myCar.position.x - Math.sin(myCar.rotation.y) * camDist;
        const targetZ = myCar.position.z - Math.cos(myCar.rotation.y) * camDist;

        camera.position.x += (targetX - camera.position.x) * 0.1;
        camera.position.z += (targetZ - camera.position.z) * 0.1;
        camera.position.y = myCar.position.y + camHeight;
        camera.lookAt(myCar.position);

        if (move !== 0 || turn !== 0) {
            socket.emit('playerMovement', {
                x: myCar.position.x,
                z: myCar.position.z,
                rot: myCar.rotation.y
            });
        }
    }

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
