// --- Game Constants ---
const MOVEMENT_SPEED = 60.0; // Slightly faster for future vibe
const ROTATION_SPEED = 3.5; 
const LERP_FACTOR = 10.0; 

// Game State
let gameActive = false;
let gameMode = 'arcade';

// --- Init Three.js ---
const scene = new THREE.Scene();
// Add heavy fog for that endless cyberpunk city look
scene.fog = new THREE.FogExp2(0x050505, 0.0025); 
scene.background = new THREE.Color(0x050505);

const clock = new THREE.Clock(); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
// Enable shadow maps for better depth
renderer.shadowMap.enabled = true; 
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- Futuristic Lighting ---
const ambientLight = new THREE.AmbientLight(0x404040, 0.5); // Dark ambient
scene.add(ambientLight);

// The "Sun" is now a distant city glow
const cityLight = new THREE.DirectionalLight(0x00ffff, 0.8);
cityLight.position.set(100, 200, 50);
cityLight.castShadow = true;
cityLight.shadow.mapSize.width = 2048;
cityLight.shadow.mapSize.height = 2048;
scene.add(cityLight);

// Add a secondary neon pink light from the opposite side
const neonLight = new THREE.PointLight(0xff00ff, 1, 1000);
neonLight.position.set(-100, 50, -100);
scene.add(neonLight);

// --- Ground (Reflective Wet Asphalt) ---
const groundGeo = new THREE.PlaneGeometry(5000, 5000); 
const groundMat = new THREE.MeshStandardMaterial({ 
    color: 0x050505, 
    roughness: 0.1, // Very smooth/wet
    metalness: 0.5
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- Networking Setup ---
const socket = io();
const infoDiv = document.getElementById('info');

// State objects
let otherPlayers = {}; 
let aiCarMeshes = {}; 
let myCar;
let myId;
let walls = []; 

// --- Helper: Build a Neon Polygon Car ---
function createPolyCar(colorHex, isAI = false) {
    const carGroup = new THREE.Group();

    // Emissive material for that "Tron" glow
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: colorHex, 
        emissive: colorHex,
        emissiveIntensity: 0.4,
        roughness: 0.2,
        metalness: 0.8
    });
    
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });

    // Chassis
    const chassisGeo = new THREE.BoxGeometry(2.2, 1, 4.5);
    const chassis = new THREE.Mesh(chassisGeo, bodyMat);
    chassis.position.y = 0.8;
    chassis.castShadow = true;
    carGroup.add(chassis);

    // Cabin (Dark glass)
    const cabinGeo = new THREE.BoxGeometry(1.8, 0.8, 2.5);
    const cabin = new THREE.Mesh(cabinGeo, darkMat);
    cabin.position.set(0, 1.6, -0.2);
    carGroup.add(cabin);

    // Wheels (Glowing rims)
    const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.5, 16); 
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const rimMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // Bright rims

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

    if (isAI) {
        carGroup.scale.set(3, 3, 3); 
        // AI cars get a specific "Enemy" color (Red glow)
        bodyMat.color.setHex(0xff0000);
        bodyMat.emissive.setHex(0x550000);
    }

    return carGroup;
}

// --- CITY & ROAD GENERATION ---

// Helper for Neon Edges
function addNeonEdges(mesh, color) {
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: color }));
    mesh.add(line);
}

function createFence(rows, cols, blockSize) {
    const totalWidth = rows * blockSize;
    const totalDepth = cols * blockSize;
    const fenceHeight = 40; // Higher fences
    
    // Grid wall material
    const fenceMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, 
        wireframe: true,
        transparent: true,
        opacity: 0.3
    });

    const halfW = totalWidth / 2;
    const halfD = totalDepth / 2;

    const fenceConfigs = [
        { w: totalWidth, d: 1, x: 0, z: -halfD }, 
        { w: totalWidth, d: 1, x: 0, z: halfD },  
        { w: 1, d: totalDepth, x: -halfW, z: 0 }, 
        { w: 1, d: totalDepth, x: halfW, z: 0 }   
    ];

    fenceConfigs.forEach(cfg => {
        const geo = new THREE.BoxGeometry(cfg.w, fenceHeight, cfg.d);
        const fence = new THREE.Mesh(geo, fenceMat);
        fence.position.set(cfg.x, fenceHeight/2, cfg.z);
        scene.add(fence);
        walls.push(fence);
    });
}

function createRoads(rows, cols, blockSize) {
    const roadWidth = 14; 
    const totalWidth = rows * blockSize;
    const totalDepth = cols * blockSize;
    
    // Dark road with no texture, just reflection
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.1 }); 
    // Glowing grid lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x00aaff }); 

    for(let c = 0; c < cols; c++) {
        const xPos = (c * blockSize) - (totalWidth / 2);
        // Main Road
        const roadGeo = new THREE.PlaneGeometry(roadWidth, totalDepth);
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.rotation.x = -Math.PI/2;
        road.position.set(xPos, 0.05, 0); 
        road.receiveShadow = true;
        scene.add(road);

        // Center Line (Cyan Glow)
        for(let i=0; i<rows; i++) {
             const zPos = (i * blockSize) - (totalDepth / 2);
             const lineGeo = new THREE.PlaneGeometry(0.5, blockSize * 0.6);
             const line = new THREE.Mesh(lineGeo, lineMat);
             line.rotation.x = -Math.PI/2;
             line.position.set(xPos, 0.08, zPos); 
             scene.add(line);
        }
    }

    for(let r = 0; r < rows; r++) {
        const zPos = (r * blockSize) - (totalDepth / 2);
        const roadGeo = new THREE.PlaneGeometry(totalWidth, roadWidth);
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.rotation.x = -Math.PI/2;
        road.position.set(0, 0.06, zPos); 
        road.receiveShadow = true;
        scene.add(road);

        for(let i=0; i<cols; i++) {
             const xPos = (i * blockSize) - (totalWidth / 2);
             const lineGeo = new THREE.PlaneGeometry(blockSize * 0.6, 0.5);
             const line = new THREE.Mesh(lineGeo, lineMat);
             line.rotation.x = -Math.PI/2;
             line.position.set(xPos, 0.09, zPos);
             scene.add(line);
        }
    }
}

function createBuilding(data) {
    // 1. Solid Black Tower
    const geo = new THREE.BoxGeometry(data.width, data.height, data.depth);
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0x020202, 
        roughness: 0.1, 
        metalness: 0.9 
    });
    const building = new THREE.Mesh(geo, mat);
    building.position.set(data.x, data.height / 2, data.z);
    building.castShadow = true;
    building.receiveShadow = true;

    // 2. Neon Wireframe Edges (The "Future" look)
    // We pick a random neon color (Cyan, Magenta, Lime, or Yellow)
    const neonColors = [0x00ffff, 0xff00ff, 0x00ff00, 0xffff00];
    const pick = neonColors[Math.floor(Math.random() * neonColors.length)];
    addNeonEdges(building, pick);

    scene.add(building);
    walls.push(building); 
}

// --- Socket Handlers ---

socket.on('cityMap', (data) => {
    walls.forEach(w => scene.remove(w));
    walls.length = 0;

    createRoads(data.rows, data.cols, data.blockSize);
    createFence(data.rows, data.cols, data.blockSize); 

    data.layout.forEach(buildingData => {
        createBuilding(buildingData);
    });
});

socket.on('updateAI', (aiData) => {
    aiData.forEach(ai => {
        if (!aiCarMeshes[ai.id]) {
            const car = createPolyCar(0x000000, true); 
            car.position.set(ai.x, 0, ai.z);
            scene.add(car);
            
            aiCarMeshes[ai.id] = { 
                mesh: car, 
                targetX: ai.x, 
                targetZ: ai.z, 
                targetRot: 0 
            };
        }

        const aiObj = aiCarMeshes[ai.id];
        aiObj.targetX = ai.x;
        aiObj.targetZ = ai.z;
        
        if (ai.dir === 1) aiObj.targetRot = Math.PI / 2;
        if (ai.dir === -1) aiObj.targetRot = -Math.PI / 2;
        if (ai.dir === 2) aiObj.targetRot = 0;
        if (ai.dir === -2) aiObj.targetRot = Math.PI;
    });
});

socket.on('currentPlayers', (serverPlayers) => {
    if (!gameActive) infoDiv.innerText = "GAME PAUSED - SELECT MODE";
    else infoDiv.innerText = "AVOID THE NEON GIANTS!";
    
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
            
            otherPlayers[id] = {
                mesh: opCar,
                targetX: p.x,
                targetZ: p.z,
                targetRot: p.rot
            };
        }
    });
});

socket.on('newPlayer', (data) => {
    const opCar = createPolyCar(data.player.color);
    opCar.position.set(data.player.x, 0, data.player.z);
    opCar.rotation.y = data.player.rot;
    scene.add(opCar);
    
    otherPlayers[data.id] = {
        mesh: opCar,
        targetX: data.player.x,
        targetZ: data.player.z,
        targetRot: data.player.rot
    };
});

socket.on('playerMoved', (data) => {
    if (otherPlayers[data.id]) {
        otherPlayers[data.id].targetX = data.x;
        otherPlayers[data.id].targetZ = data.z;
        otherPlayers[data.id].targetRot = data.rot;
    }
});

socket.on('playerDisconnected', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id].mesh); 
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

// --- Physics Check (IMPROVED HITBOXES) ---
const tempCarBox = new THREE.Box3();
const tempObstacleBox = new THREE.Box3();

function checkCollision(x, z) {
    // Current player box
    tempCarBox.setFromCenterAndSize(
        new THREE.Vector3(x, 1, z),
        new THREE.Vector3(2.2, 2, 4.5) 
    );

    // Walls
    for (let wall of walls) {
        tempObstacleBox.setFromObject(wall);
        if (tempCarBox.intersectsBox(tempObstacleBox)) return true;
    }

    // AI Cars (UPDATED: FULL HITBOX)
    for (const id in aiCarMeshes) {
        const aiCar = aiCarMeshes[id].mesh; 
        
        // Before: We shrank the box by -1.0
        // NOW: We take the FULL object bounds. 
        tempObstacleBox.setFromObject(aiCar);
        
        // Optional: A tiny epsilon expansion can ensure very strict collision
        // tempObstacleBox.expandByScalar(0); 
        
        if (tempCarBox.intersectsBox(tempObstacleBox)) return true;
    }

    // Other Players
    for (const id in otherPlayers) {
        const otherCar = otherPlayers[id].mesh;
        tempObstacleBox.setFromObject(otherCar);
        // Reduce leniency on other players too
        tempObstacleBox.expandByScalar(-0.2); 
        if (tempCarBox.intersectsBox(tempObstacleBox)) return true;
    }

    return false;
}

// --- Menu Hook ---
window.initGameLogic = function(mode) {
    console.log("Mode Selected:", mode);
    gameMode = mode;
    gameActive = true;
    
    // Slight tweak based on mode (Client side logic)
    if(mode === 'drift') {
        // Reduce grip? (Just visual flavor for now as physics are simple)
        infoDiv.innerText = "DRIFT MODE ACTIVATED";
    } else {
        infoDiv.innerText = "GO! GO! GO!";
    }
}

// --- Main Loop ---
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta(); 

    // Only move if game started
    if (myCar && gameActive) {
        let moveDist = 0;
        let turnAngle = 0;

        if (keys.w) moveDist = MOVEMENT_SPEED * delta;
        if (keys.s) moveDist = -MOVEMENT_SPEED * delta;
        if (keys.a) turnAngle = ROTATION_SPEED * delta;
        if (keys.d) turnAngle = -ROTATION_SPEED * delta;

        myCar.rotation.y += turnAngle;

        const dx = Math.sin(myCar.rotation.y) * moveDist;
        const dz = Math.cos(myCar.rotation.y) * moveDist;

        const nextX = myCar.position.x + dx;
        const nextZ = myCar.position.z + dz;

        if (!checkCollision(nextX, nextZ)) {
            myCar.position.x = nextX;
            myCar.position.z = nextZ;
        } else {
            // Collision Bounce
            myCar.position.x -= dx * 0.5;
            myCar.position.z -= dz * 0.5;
        }

        // Camera Logic
        const camDist = 20; 
        const camHeight = 8;
        
        const targetX = myCar.position.x - Math.sin(myCar.rotation.y) * camDist;
        const targetZ = myCar.position.z - Math.cos(myCar.rotation.y) * camDist;

        const smoothing = 5.0 * delta; 
        camera.position.x += (targetX - camera.position.x) * smoothing;
        camera.position.z += (targetZ - camera.position.z) * smoothing;
        camera.position.y = myCar.position.y + camHeight;
        camera.lookAt(myCar.position);

        if (moveDist !== 0 || turnAngle !== 0) {
            socket.emit('playerMovement', {
                x: myCar.position.x,
                z: myCar.position.z,
                rot: myCar.rotation.y
            });
        }
    } else if (myCar && !gameActive) {
        // Idle camera rotation while in menu
        camera.position.x = myCar.position.x + Math.sin(clock.getElapsedTime() * 0.5) * 40;
        camera.position.z = myCar.position.z + Math.cos(clock.getElapsedTime() * 0.5) * 40;
        camera.position.y = 30;
        camera.lookAt(myCar.position);
    }

    // --- INTERPOLATION ---
    for (const id in aiCarMeshes) {
        const obj = aiCarMeshes[id];
        if (obj.mesh && obj.targetX !== undefined) {
            const lerpSpeed = LERP_FACTOR * delta;
            obj.mesh.position.x += (obj.targetX - obj.mesh.position.x) * lerpSpeed;
            obj.mesh.position.z += (obj.targetZ - obj.mesh.position.z) * lerpSpeed;
            obj.mesh.rotation.y = obj.targetRot;
        }
    }

    for (const id in otherPlayers) {
        const obj = otherPlayers[id];
        if (obj.mesh && obj.targetX !== undefined) {
            const lerpSpeed = LERP_FACTOR * delta;
            obj.mesh.position.x += (obj.targetX - obj.mesh.position.x) * lerpSpeed;
            obj.mesh.position.z += (obj.targetZ - obj.mesh.position.z) * lerpSpeed;
            obj.mesh.rotation.y += (obj.targetRot - obj.mesh.rotation.y) * lerpSpeed;
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
