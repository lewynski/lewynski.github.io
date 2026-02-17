const config = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.FIT,
        parent: 'game-wrapper',
        width: 800,
        height: 600
    },
    backgroundColor: '#f8fafc',
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false }
    },
    scene: { create: create, update: update }
};

const game = new Phaser.Game(config);

let player, playerLabel;
let cursors, wasd;
let moveSpeed = 200; 
let isDialogueOpen = false;

// Touch variables
let touchUp = false, touchDown = false, touchLeft = false, touchRight = false;

const resumeData = {
    elem: { title: "Primary Education", text: "<strong>Jose G. Peralta Memorial School</strong><br>Graduated Valedictorian (2011-2017)" },
    jhs: { title: "Junior High School", text: "<strong>Fellowship Baptist College</strong><br>Graduated With Honor (2017-2021)" },
    shs: { title: "Senior High School (STEM)", text: "<strong>Fellowship Baptist College</strong><br>Graduated With High Honor (2021-2023)" },
    college: { title: "B.S. Electronics Engineering", text: "<strong>Polytechnic University of the Philippines</strong><br>Present. Affiliations: OECES, IECEP Batangas." },
    work: { title: "Professional Experience", text: "<strong>Bandai Wireharness (2025):</strong> Developed automated macro systems.<br><br><strong>NOCECO (2023):</strong> Assisted in daily technical operations." }
};

function create() {
    this.physics.world.setBounds(0, 0, 800, 600);

    // --- GAME FOCUS FIX ---
    // If user clicks the canvas, ensure keyboard is captured
    this.input.on('pointerdown', () => {
        window.focus();
    });

    const stations = this.physics.add.staticGroup();

    function createStation(scene, x, y, width, height, title) {
        scene.add.rectangle(x, y + 4, width, height, 0xe2e8f0);
        let block = scene.add.rectangle(x, y, width, height, 0x94a3b8);
        block.setStrokeStyle(2, 0x64748b);
        scene.add.text(x, y + (height/2) + 10, title, { 
            font: '12px Inter', fill: '#4b5563', fontStyle: 'bold' 
        }).setOrigin(0.5);
        return block;
    }

    function createDottedZone(scene, x, y, width, height, title) {
        let box = scene.add.rectangle(x, y, width, height, 0xffffff, 0);
        box.setStrokeStyle(2, 0x9ca3af); 
        scene.add.text(x, y, title, { font: '14px Inter', fill: '#111827', fontStyle: 'bold' }).setOrigin(0.5);
        scene.add.text(x, y + 20, "Step inside to view", { font: '10px Inter', fill: '#6b7280' }).setOrigin(0.5);
        return box;
    }

    let elemSt = createStation(this, 150, 450, 60, 40, "Primary Edu");
    createTrigger(this, 150, 480, resumeData.elem);

    let jhsSt = createStation(this, 150, 250, 60, 40, "Junior High");
    createTrigger(this, 150, 280, resumeData.jhs);

    let shsSt = createStation(this, 400, 150, 60, 40, "Senior High");
    createTrigger(this, 400, 180, resumeData.shs);

    let colSt = createStation(this, 650, 250, 80, 50, "PUP College");
    createTrigger(this, 650, 290, resumeData.college);

    let workZone = createDottedZone(this, 400, 450, 200, 100, "Work Experience");
    createTrigger(this, 400, 450, resumeData.work);

    player = this.add.rectangle(400, 350, 24, 24, 0x3b82f6);
    this.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);
    
    playerLabel = this.add.text(400, 380, "Jon Lewyn", { 
        font: '12px Inter', fill: '#111827', fontStyle: 'bold', 
        backgroundColor: '#ffffff', padding: {x:4, y:2} 
    }).setOrigin(0.5);
    playerLabel.setShadow(0, 1, 'rgba(0,0,0,0.1)', 2);

    cursors = this.input.keyboard.createCursorKeys();
    wasd = this.input.keyboard.addKeys({ 
        'up': Phaser.Input.Keyboard.KeyCodes.W, 
        'down': Phaser.Input.Keyboard.KeyCodes.S, 
        'left': Phaser.Input.Keyboard.KeyCodes.A, 
        'right': Phaser.Input.Keyboard.KeyCodes.D 
    });

    setupMobileControls();

    document.getElementById('close-dialogue').addEventListener('click', closeDialogue);
}

function update() {
    playerLabel.x = player.x;
    playerLabel.y = player.y + 25;

    if (isDialogueOpen) {
        player.body.setVelocity(0);
        return;
    }

    let velX = 0;
    let velY = 0;

    // Supports WASD, Arrow Keys, OR Mobile Touch buttons!
    if (cursors.left.isDown || wasd.left.isDown || touchLeft) velX = -moveSpeed;
    else if (cursors.right.isDown || wasd.right.isDown || touchRight) velX = moveSpeed;

    if (cursors.up.isDown || wasd.up.isDown || touchUp) velY = -moveSpeed;
    else if (cursors.down.isDown || wasd.down.isDown || touchDown) velY = moveSpeed;

    player.body.setVelocity(velX, velY);

    if (velX !== 0 && velY !== 0) {
        player.body.velocity.normalize().scale(moveSpeed);
    }
}

function createTrigger(scene, x, y, data) {
    let pad = scene.add.rectangle(x, y, 60, 40, 0x000000, 0); 
    scene.physics.add.existing(pad, true); 

    scene.physics.add.overlap(player, pad, () => {
        if (!isDialogueOpen) {
            showDialogue(data.title, data.text);
        }
    });
}

function showDialogue(title, text) {
    isDialogueOpen = true;
    const overlay = document.getElementById('dialogue-overlay');
    document.getElementById('dialogue-title').innerHTML = title;
    document.getElementById('dialogue-text').innerHTML = text;
    overlay.style.display = 'block';
}

function closeDialogue() {
    document.getElementById('dialogue-overlay').style.display = 'none';
    player.y += 15; // Bounce player off pad so they can move away
    setTimeout(() => { isDialogueOpen = false; }, 200);
}

// --- MOBILE TOUCHSCREEN HANDLERS ---
function setupMobileControls() {
    // Check if the user is on a touch device
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        document.getElementById('mobile-controls').style.display = 'block';
        // Hide the PC instruction panel to save space on phones
        const pcInstructions = document.getElementById('pc-instructions');
        if (pcInstructions) pcInstructions.style.display = 'none';
    }

    const setupBtn = (id, startFn, endFn) => {
        const btn = document.getElementById(id);
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); startFn(); });
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); startFn(); });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); endFn(); });
        btn.addEventListener('mouseup', (e) => { e.preventDefault(); endFn(); });
        btn.addEventListener('mouseleave', (e) => { e.preventDefault(); endFn(); });
    };

    setupBtn('btn-up', () => touchUp = true, () => touchUp = false);
    setupBtn('btn-down', () => touchDown = true, () => touchDown = false);
    setupBtn('btn-left', () => touchLeft = true, () => touchLeft = false);
    setupBtn('btn-right', () => touchRight = true, () => touchRight = false);
}
