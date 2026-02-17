// Game Configuration
const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    backgroundColor: '#1e293b', // Dark background
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 }, // Top-down game, no gravity
            debug: false // Set to true to see collision boxes
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

// --- Game Variables ---
let player;
let cursors;
let wasd;
let moveSpeed = 200;
let isDialogueOpen = false;
// Mobile touch variables
let touchUp = false, touchDown = false, touchLeft = false, touchRight = false;

// Progression Flags
let progress = {
    elem: false,
    jhs: false,
    shs: false,
    college: false
};

// Barriers (Gates)
let gateJHS, gateSHS, gateCollege, gateWork;

// --- RESUME DATA STORE ---
const resumeData = {
    elem: {
        title: "Primary Education (2011-2017)",
        text: "Jose G. Peralta Memorial School.<br><br>Achievement: Graduated Valedictorian."
    },
    jhs: {
        title: "Junior High School (2017-2021)",
        text: "Fellowship Baptist College.<br><br>Achievement: Graduated With Honor."
    },
    shs: {
        title: "Senior High School - STEM (2021-2023)",
        text: "Fellowship Baptist College.<br><br>Achievement: Graduated With High Honor. Focus on Science, Technology, Engineering, and Mathematics."
    },
    college: {
        title: "B.S. Electronics Engineering (2023-Present)",
        text: "Polytechnic University of the Philippines (PUP).<br><br>Affiliations: OECES Special Project Officer, IECEP Batangas Student Chapter."
    },
    work: {
        title: "Professional Experience",
        text: "<strong>Bandai Wireharness (2025):</strong> Developed automated macro systems to reduce production time.<br><br><strong>NOCECO (2023):</strong> Assisted supervisors in daily technical operations."
    }
};

function preload() {
    // In a real game, load spritesheets and tilesets here.
    // For prototype, we use placeholder shapes generated in 'create'.
}

function create() {
    // 1. Setup World Boundaries
    this.physics.world.setBounds(0, 0, 2000, 2000);

    // 2. Create Ground (Placeholder Green)
    this.add.rectangle(1000, 1000, 2000, 2000, 0x0f172a).setDepth(-1);
    // Add a path (lighter color)
    let path = this.add.rectangle(1000, 1000, 200, 2000, 0x334155).setDepth(0);

    // 3. Create Buildings (Static Physics Objects)
    // Instead of images, we use colored rectangles for now.
    const buildings = this.physics.add.staticGroup();

    // Building 1: Elementary (Bottom) - Red
    let bElem = this.add.rectangle(1000, 1600, 300, 200, 0xef4444);
    buildings.add(bElem);
    createTrigger(this, 1000, 1720, resumeData.elem, 'elem');

    // Building 2: Junior High (Mid-Bottom) - Orange
    let bJHS = this.add.rectangle(1000, 1200, 300, 200, 0xf97316);
    buildings.add(bJHS);
    createTrigger(this, 1000, 1320, resumeData.jhs, 'jhs');

    // Building 3: Senior High (Center) - Yellow
    let bSHS = this.add.rectangle(1000, 800, 300, 200, 0xeab308);
    buildings.add(bSHS);
    createTrigger(this, 1000, 920, resumeData.shs, 'shs');

    // Building 4: College (Mid-Top) - Green
    let bCollege = this.add.rectangle(1000, 400, 350, 250, 0x22c55e);
    buildings.add(bCollege);
    createTrigger(this, 1000, 550, resumeData.college, 'college');

    // Building 5: Work (Top) - Blue
    let bWork = this.add.rectangle(1000, 100, 400, 200, 0x3b82f6);
    buildings.add(bWork);
    createTrigger(this, 1000, 220, resumeData.work, 'work');


    // 4. Create Progression Gates (Barriers)
    const gates = this.physics.add.staticGroup();
    // Gate blocking JHS
    gateJHS = this.add.rectangle(1000, 1400, 220, 20, 0xffffff).setAlpha(0.5);
    gates.add(gateJHS);
    // Gate blocking SHS
    gateSHS = this.add.rectangle(1000, 1000, 220, 20, 0xffffff).setAlpha(0.5);
    gates.add(gateSHS);
    // Gate blocking College
    gateCollege = this.add.rectangle(1000, 600, 220, 20, 0xffffff).setAlpha(0.5);
    gates.add(gateCollege);


    // 5. Create Player (Placeholder White Square)
    // Starting position at the bottom of the map
    player = this.add.rectangle(1000, 1900, 32, 32, 0xffffff);
    this.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);

    // Camera Follow
    this.cameras.main.startFollow(player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.5);

    // Collisions
    this.physics.add.collider(player, buildings);
    this.physics.add.collider(player, gates);

    // 6. Controls Setup
    cursors = this.input.keyboard.createCursorKeys();
    wasd = this.input.keyboard.addKeys({ 'up': Phaser.Input.Keyboard.KeyCodes.W, 'down': Phaser.Input.Keyboard.KeyCodes.S, 'left': Phaser.Input.Keyboard.KeyCodes.A, 'right': Phaser.Input.Keyboard.KeyCodes.D });

    setupMobileControls();

    // UI Listeners
    document.getElementById('close-dialogue').addEventListener('click', closeDialogue);
}

function update() {
    // Stop movement if dialogue is open based on the boolean flag
    if (isDialogueOpen) {
        player.body.setVelocity(0);
        return;
    }

    // Reset velocity
    player.body.setVelocity(0);

    // Horizontal Movement (PC & Mobile combined)
    if (cursors.left.isDown || wasd.left.isDown || touchLeft) {
        player.body.setVelocityX(-moveSpeed);
    } else if (cursors.right.isDown || wasd.right.isDown || touchRight) {
        player.body.setVelocityX(moveSpeed);
    }

    // Vertical Movement (PC & Mobile combined)
    if (cursors.up.isDown || wasd.up.isDown || touchUp) {
        player.body.setVelocityY(-moveSpeed);
    } else if (cursors.down.isDown || wasd.down.isDown || touchDown) {
        player.body.setVelocityY(moveSpeed);
    }

    // Normalize speed for diagonals
    if (player.body.velocity.x !== 0 && player.body.velocity.y !== 0) {
        player.body.velocity.normalize().scale(moveSpeed);
    }
}


// --- Helper Functions ---

// Creates an invisible trigger zone in front of a building
function createTrigger(scene, x, y, data, stageKey) {
    let trigger = scene.add.rectangle(x, y, 100, 50, 0xffff00, 0.3); // semi-transparent yellow for debug
    scene.physics.add.existing(trigger, true); // true = static body

    scene.physics.add.overlap(player, trigger, () => {
        if (!isDialogueOpen) {
            showDialogue(data.title, data.text);
            unlockNextStage(stageKey);
        }
    });
}

// Handles unlocking gates based on progress
function unlockNextStage(currentStage) {
    if (currentStage === 'elem' && !progress.elem) {
        progress.elem = true;
        gateJHS.destroy(); // Remove the gate
        alert("Achievement Unlocked: Valedictorian! Path to High School opened.");
    }
    else if (currentStage === 'jhs' && !progress.jhs) {
        progress.jhs = true;
        gateSHS.destroy();
        alert("Junior High Completed! STEM path opened.");
    }
    else if (currentStage === 'shs' && !progress.shs) {
        progress.shs = true;
        gateCollege.destroy();
        alert("Senior High Graduated! The road to PUP is open.");
    }
}

// Shows the HTML overlay
function showDialogue(title, text) {
    isDialogueOpen = true;
    const overlay = document.getElementById('dialogue-overlay');
    document.getElementById('dialogue-title').innerHTML = title;
    document.getElementById('dialogue-text').innerHTML = text;
    overlay.style.display = 'block';
}

// Closes the HTML overlay
function closeDialogue() {
    document.getElementById('dialogue-overlay').style.display = 'none';
    // Small delay before allowing movement again so they don't instantly re-trigger
    setTimeout(() => { isDialogueOpen = false; }, 200);
}

// Wire up HTML buttons to JS variables
function setupMobileControls() {
    // Only show on touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        document.getElementById('mobile-controls').style.display = 'block';
    }

    const setupBtn = (id, startFn, endFn) => {
        const btn = document.getElementById(id);
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); startFn(); });
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); startFn(); });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); endFn(); });
        btn.addEventListener('mouseup', (e) => { e.preventDefault(); endFn(); });
    };

    setupBtn('btn-up', () => touchUp = true, () => touchUp = false);
    setupBtn('btn-down', () => touchDown = true, () => touchDown = false);
    setupBtn('btn-left', () => touchLeft = true, () => touchLeft = false);
    setupBtn('btn-right', () => touchRight = true, () => touchRight = false);
}

// Handle window resizing
window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
});
