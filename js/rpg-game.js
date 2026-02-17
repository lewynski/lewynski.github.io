const config = {
    type: Phaser.AUTO, // Automatically falls back to safe Canvas mode if WebGL fails
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    backgroundColor: '#020617', 
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false }
    },
    scene: { create: create, update: update }
};

const game = new Phaser.Game(config);

let player, cursors, wasd;
let playerGlow; // Safe glow variable
let moveSpeed = 250; 
let isDialogueOpen = false;
let touchUp = false, touchDown = false, touchLeft = false, touchRight = false;

let progress = { elem: false, jhs: false, shs: false, college: false };
let gateJHS, gateSHS, gateCollege;

const resumeData = {
    elem: { title: "Primary Education (2011-2017)", text: "<strong>Jose G. Peralta Memorial School.</strong><br><br>Achievement: Graduated Valedictorian." },
    jhs: { title: "Junior High School (2017-2021)", text: "<strong>Fellowship Baptist College.</strong><br><br>Achievement: Graduated With Honor." },
    shs: { title: "Senior High School - STEM (2021-2023)", text: "<strong>Fellowship Baptist College.</strong><br><br>Achievement: Graduated With High Honor.<br>Focus on Science, Technology, Engineering, and Mathematics." },
    college: { title: "B.S. Electronics Engineering (2023-Present)", text: "<strong>Polytechnic University of the Philippines (PUP).</strong><br><br>Affiliations: OECES Special Project Officer, IECEP Batangas Student Chapter." },
    work: { title: "Professional Experience", text: "<strong>Bandai Wireharness (2025):</strong> Developed automated macro systems to reduce production time.<br><br><strong>NOCECO (2023):</strong> Assisted supervisors in daily technical operations." }
};

function create() {
    this.physics.world.setBounds(0, 0, 2000, 2000);

    // 1. AESTHETIC BACKGROUND
    this.add.grid(1000, 1000, 2000, 2000, 64, 64, 0x020617, 1, 0x1e293b, 0.5).setDepth(-2);
    let path = this.add.rectangle(1000, 1000, 240, 2000, 0x0f172a).setDepth(-1);
    path.setStrokeStyle(2, 0x334155);

    const buildings = this.physics.add.staticGroup();

    // 2. AESTHETIC BUILDINGS
    function createZone(scene, x, y, width, height, color, emoji, title) {
        let glow = scene.add.rectangle(x, y, width, height, color, 0.1);
        glow.setStrokeStyle(3, color, 0.8);
        buildings.add(glow);

        scene.add.text(x, y - 15, emoji, { font: '40px Arial' }).setOrigin(0.5);
        scene.add.text(x, y + 30, title, { font: '16px Inter', fill: '#cbd5e1', fontStyle: 'bold' }).setOrigin(0.5);
        return glow;
    }

    createZone(this, 1000, 1650, 300, 150, 0xef4444, '🎒', 'Elementary');
    createTrigger(this, 1000, 1750, resumeData.elem, 'elem', 0xef4444);

    createZone(this, 1000, 1250, 300, 150, 0xf97316, '🏫', 'Junior High');
    createTrigger(this, 1000, 1350, resumeData.jhs, 'jhs', 0xf97316);

    createZone(this, 1000, 850, 300, 150, 0xeab308, '🎓', 'Senior High');
    createTrigger(this, 1000, 950, resumeData.shs, 'shs', 0xeab308);

    createZone(this, 1000, 450, 350, 180, 0x22c55e, '🏛️', 'PUP College');
    createTrigger(this, 1000, 560, resumeData.college, 'college', 0x22c55e);

    createZone(this, 1000, 100, 400, 180, 0x3b82f6, '💼', 'Experience');
    createTrigger(this, 1000, 210, resumeData.work, 'work', 0x3b82f6);

    // 3. AESTHETIC GATES
    const gates = this.physics.add.staticGroup();
    function createGate(scene, y) {
        let g = scene.add.rectangle(1000, y, 240, 10, 0xef4444, 0.6);
        g.setStrokeStyle(2, 0xff0000, 1);
        gates.add(g);
        return g;
    }
    gateJHS = createGate(this, 1450);
    gateSHS = createGate(this, 1050);
    gateCollege = createGate(this, 650);

    // 4. CRASH-PROOF PLAYER AESTHETICS
    // We create a separate, slightly larger transparent circle to act as a glow
    playerGlow = this.add.circle(1000, 1900, 22, 0x3b82f6, 0.3);
    
    player = this.add.circle(1000, 1900, 14, 0x3b82f6);
    player.setStrokeStyle(3, 0x60a5fa);
    
    this.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);

    // Camera
    this.cameras.main.startFollow(player, true, 0.08, 0.08); 
    this.cameras.main.setZoom(1.2);

    // Collisions
    this.physics.add.collider(player, buildings);
    this.physics.add.collider(player, gates);

    // Controls
    cursors = this.input.keyboard.createCursorKeys();
    wasd = this.input.keyboard.addKeys({ 'up': Phaser.Input.Keyboard.KeyCodes.W, 'down': Phaser.Input.Keyboard.KeyCodes.S, 'left': Phaser.Input.Keyboard.KeyCodes.A, 'right': Phaser.Input.Keyboard.KeyCodes.D });
    setupMobileControls();

    document.getElementById('close-dialogue').addEventListener('click', closeDialogue);
}

function update() {
    // Make the safe glow follow the player exactly
    playerGlow.x = player.x;
    playerGlow.y = player.y;

    if (isDialogueOpen) {
        player.body.setVelocity(0);
        return;
    }

    let velX = 0;
    let velY = 0;

    if (cursors.left.isDown || wasd.left.isDown || touchLeft) velX = -moveSpeed;
    else if (cursors.right.isDown || wasd.right.isDown || touchRight) velX = moveSpeed;

    if (cursors.up.isDown || wasd.up.isDown || touchUp) velY = -moveSpeed;
    else if (cursors.down.isDown || wasd.down.isDown || touchDown) velY = moveSpeed;

    player.body.setVelocity(velX, velY);

    if (velX !== 0 && velY !== 0) {
        player.body.velocity.normalize().scale(moveSpeed);
    }
}

// Helper: Creates a pulsing "step here" trigger pad
function createTrigger(scene, x, y, data, stageKey, color) {
    let pad = scene.add.rectangle(x, y, 120, 30, color, 0.2);
    pad.setStrokeStyle(2, color, 0.8);
    scene.add.text(x, y, "STEP HERE", { font: '10px Inter', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    scene.physics.add.existing(pad, true); 

    scene.tweens.add({ targets: pad, alpha: 0.5, yoyo: true, repeat: -1, duration: 800 });

    scene.physics.add.overlap(player, pad, () => {
        if (!isDialogueOpen) {
            showDialogue(data.title, data.text);
            unlockNextStage(stageKey);
        }
    });
}

function unlockNextStage(currentStage) {
    if (currentStage === 'elem' && !progress.elem) {
        progress.elem = true;
        gateJHS.destroy(); 
    }
    else if (currentStage === 'jhs' && !progress.jhs) {
        progress.jhs = true;
        gateSHS.destroy();
    }
    else if (currentStage === 'shs' && !progress.shs) {
        progress.shs = true;
        gateCollege.destroy();
    }
}

function showDialogue(title, text) {
    isDialogueOpen = true;
    const overlay = document.getElementById('dialogue-overlay');
    document.getElementById('title-text').innerHTML = title;
    document.getElementById('dialogue-text').innerHTML = text;
    overlay.style.display = 'block';
}

function closeDialogue() {
    document.getElementById('dialogue-overlay').style.display = 'none';
    setTimeout(() => { isDialogueOpen = false; }, 200);
}

function setupMobileControls() {
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

window.addEventListener('resize', () => { game.scale.resize(window.innerWidth, window.innerHeight); });
