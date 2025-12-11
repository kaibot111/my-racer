// --- Game Constants ---
const SPEED = 0.8;
const TURN_SPEED = 0.05;

// --- Init Three.js ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0b2e); // Night City Sky (Dark Purple/Blue)
scene.fog = new THREE.Fog(0x1a0b2e, 20, 300);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

// City Lights (Directional)
const cityLight = new THREE.DirectionalLight(0xffaa00, 0.8); // Warm street light feel
cityLight.position.set(50, 100, 50);
cityLight.castShadow = true;
scene.add(cityLight);

const moonLight = new THREE.DirectionalLight(0xaaccff, 0.5); // Cool blue moonlight
moonLight.position.set(-50, 100, -50);
scene.add(moonLight);

// --- Ground (Asphalt) ---
const groundGeo = new THREE.PlaneGeometry(2000, 2000); 
const groundMat = new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true }); // Dark Grey
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
    const cabinMat = new THREE.MeshLambertMaterial({ color: 0x111111, flatShading: true }); // Tinted windows
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.6, -0.2);
    carGroup.add(cabin);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.5, 8); 
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x000000, flatShading: true });
    
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

// --- CITY GENERATION ---
const walls = []; // We still call them 'walls' for collision logic
const buildingCount = 20;

function createBuilding(x, z, width, depth, height) {
    // Random Building Color (Greys, Blues, Slight purples)
    const grayScale = Math.random() * 0.5 + 0.1;
    const buildingColor = new THREE.Color().setRGB(grayScale, grayScale, grayScale + 0.1);

    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshStandardMaterial({ color: buildingColor, flatShading: true });
    
    const building = new THREE.Mesh(geo, mat);
    // Position y is half height so it sits on ground
    building.position.set(x, height / 2, z);
    
    scene.add(building);
    walls.push(building); // Add to collision list
}

// Generate 20 Random Buildings
for (let i = 0; i < buildingCount; i++) {
    // Random Position (-400 to 400)
    const bx = (Math.random() * 800) - 400;
    const bz = (Math.random() * 800) - 400;

    // Random Size
    const bWidth = 20 + Math.random() * 40;  // 20 to 60 wide
    const bDepth = 20 + Math.random() * 40;  // 20 to 60 deep
    const bHeight = 40 + Math.random() * 100; // 40 to 140 tall (Skyscrapers!)

    createBuilding(bx, bz, bWidth, bDepth, bHeight);
}

// --- Socket Handlers ---

socket.on('currentPlayers', (serverPlayers) => {
    infoDiv.innerText = "EXPLORE THE CITY - ARROW KEYS / WASD";
    Object.keys(serverPlayers).forEach((id) => {
        if (id === socket.id) {
            myId = id;
            myCar = createPolyCar(serverPlayers[id].color);
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
        const camDist = 20; 
        const camHeight = 8;
        
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
