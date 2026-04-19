document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const overlay = document.getElementById('overlay');
    const overlayCtx = overlay.getContext('2d');

    const colors = document.querySelectorAll('.color');
    const sizes = document.querySelectorAll('.size');
    const toolButtons = document.querySelectorAll('.tool-button');
    const stickers = document.querySelectorAll('.sticker');
    const stickerPicker = document.getElementById('stickerPicker');
    const clearBtn = document.getElementById('clear');
    const saveBtn = document.getElementById('save');
    const undoBtn = document.getElementById('undo');

    // ---------- State ----------
    let isDrawing = false;
    let currentColor = '#000000';
    let currentSize = 5;
    let currentTool = 'pen';
    let currentSticker = '❤️';
    let lastX = 0;
    let lastY = 0;
    let rainbowHue = 0;
    let stickerPreview = null;
    let mirrorMode = false;

    const mx = x => canvas.width - x;

    // ---------- Sound system ----------
    let audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) audioCtx = new AC();
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function playTone({ freq = 440, type = 'sine', duration = 0.15, volume = 0.15, sweep = null, delay = 0, attack = 0.02, filter = null }) {
        const ac = getAudioCtx();
        if (!ac) return;
        const now = ac.currentTime + delay;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (sweep !== null) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(sweep, 20), now + duration);
        }
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        let node = osc;
        if (filter) {
            const biq = ac.createBiquadFilter();
            biq.type = 'lowpass';
            biq.frequency.setValueAtTime(filter, now);
            node.connect(biq);
            node = biq;
        }
        node.connect(gain);
        gain.connect(ac.destination);
        osc.start(now);
        osc.stop(now + duration + 0.05);
    }

    // Warmer, deeper palette. Lower fundamentals, softer attack/release, lowpass filtering on sharper tones.
    const sounds = {
        pop: () => playTone({ freq: 220, sweep: 330, type: 'sine', duration: 0.18, volume: 0.16, attack: 0.015 }),
        click: () => playTone({ freq: 330, type: 'triangle', duration: 0.1, volume: 0.1, attack: 0.01, filter: 1500 }),
        swoosh: () => playTone({ freq: 180, sweep: 380, type: 'sine', duration: 0.22, volume: 0.14, attack: 0.02 }),
        chirp: () => {
            // warm bell: C5 + E5 + G5
            playTone({ freq: 523, type: 'sine', duration: 0.55, volume: 0.14, attack: 0.01 });
            playTone({ freq: 659, type: 'sine', duration: 0.6, volume: 0.1, attack: 0.01, delay: 0.05 });
            playTone({ freq: 784, type: 'sine', duration: 0.65, volume: 0.08, attack: 0.01, delay: 0.1 });
        },
        whoosh: () => {
            playTone({ freq: 160, sweep: 60, type: 'sawtooth', duration: 0.45, volume: 0.1, attack: 0.02, filter: 600 });
            playTone({ freq: 80, sweep: 40, type: 'sine', duration: 0.5, volume: 0.12, attack: 0.03 });
        },
        plop: () => playTone({ freq: 240, sweep: 110, type: 'sine', duration: 0.15, volume: 0.18, attack: 0.005 }),
        sparkle: () => playTone({ freq: 1200 + Math.random() * 500, type: 'sine', duration: 0.18, volume: 0.04, attack: 0.02 }),
        spray: () => playTone({ freq: 2500, type: 'sawtooth', duration: 0.03, volume: 0.015, attack: 0.005, filter: 3000 }),
        undo: () => {
            playTone({ freq: 520, sweep: 260, type: 'sine', duration: 0.18, volume: 0.14, attack: 0.01 });
            playTone({ freq: 780, sweep: 390, type: 'sine', duration: 0.2, volume: 0.08, attack: 0.01, delay: 0.04 });
        },
    };

    // ---------- Glitter particle system ----------
    const sparkles = [];

    function hexToHsl(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) { h = 0; s = 0; }
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
                case g: h = ((b - r) / d + 2); break;
                case b: h = ((r - g) / d + 4); break;
            }
            h /= 6;
        }
        return { h: h * 360, s: s * 100, l: l * 100 };
    }

    function glitterShade(hex, { lightRange = 55, hueRange = 14, minL = 25, maxL = 92 } = {}) {
        const { h, s, l } = hexToHsl(hex);
        const dl = (Math.random() - 0.5) * lightRange;
        const dh = (Math.random() - 0.5) * hueRange;
        const newL = Math.max(minL, Math.min(maxL, l + dl));
        const newH = (h + dh + 360) % 360;
        const newS = s < 15 ? s : Math.max(60, s);
        return `hsl(${newH}, ${newS}%, ${newL}%)`;
    }

    function spawnSparkle(x, y) {
        sparkles.push({
            x, y,
            size: 4 + Math.random() * 8,
            age: 0,
            maxAge: 30 + Math.random() * 30,
            color: glitterShade(currentColor, { lightRange: 40, minL: 55, maxL: 95 }),
            rotation: Math.random() * Math.PI,
        });
    }

    function drawStar(c, x, y, size, color, alpha) {
        c.save();
        c.globalAlpha = alpha;
        c.fillStyle = color;
        c.translate(x, y);
        c.beginPath();
        c.moveTo(0, -size);
        c.lineTo(size * 0.22, -size * 0.22);
        c.lineTo(size, 0);
        c.lineTo(size * 0.22, size * 0.22);
        c.lineTo(0, size);
        c.lineTo(-size * 0.22, size * 0.22);
        c.lineTo(-size, 0);
        c.lineTo(-size * 0.22, -size * 0.22);
        c.closePath();
        c.fill();
        c.restore();
    }

    function stickerFontSize() {
        return Math.max(40, currentSize * 6);
    }

    function animateOverlay() {
        overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
        for (const s of sparkles) {
            s.age++;
            const t = s.age / s.maxAge;
            const alpha = 1 - t;
            const size = s.size * (0.6 + Math.sin(t * Math.PI) * 0.6);
            drawStar(overlayCtx, s.x, s.y, size, s.color, Math.max(alpha, 0));
        }
        for (let i = sparkles.length - 1; i >= 0; i--) {
            if (sparkles[i].age >= sparkles[i].maxAge) sparkles.splice(i, 1);
        }
        if (stickerPreview) {
            const fs = stickerFontSize();
            overlayCtx.save();
            overlayCtx.globalAlpha = 0.6;
            overlayCtx.font = `${fs}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
            overlayCtx.textAlign = 'center';
            overlayCtx.textBaseline = 'middle';
            overlayCtx.fillText(currentSticker, stickerPreview.x, stickerPreview.y);
            if (mirrorMode) overlayCtx.fillText(currentSticker, mx(stickerPreview.x), stickerPreview.y);
            overlayCtx.restore();
        }

        if (mirrorMode) {
            overlayCtx.save();
            overlayCtx.strokeStyle = 'rgba(0, 231, 86, 0.35)';
            overlayCtx.lineWidth = 1;
            overlayCtx.setLineDash([6, 8]);
            overlayCtx.beginPath();
            overlayCtx.moveTo(canvas.width / 2, 0);
            overlayCtx.lineTo(canvas.width / 2, canvas.height);
            overlayCtx.stroke();
            overlayCtx.restore();
        }
        requestAnimationFrame(animateOverlay);
    }
    requestAnimationFrame(animateOverlay);

    // ---------- Coordinate helpers ----------
    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let clientX, clientY;
        if (e.type.includes('touch')) {
            clientX = e.touches[0] ? e.touches[0].clientX : e.changedTouches[0].clientX;
            clientY = e.touches[0] ? e.touches[0].clientY : e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    }

    // ---------- Drawing primitives per tool ----------
    function drawPenSegment(x1, y1, x2, y2, color, size) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = size;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    function drawSpray(x, y, color, size) {
        ctx.fillStyle = color;
        const density = Math.max(6, size * 2);
        const radius = size * 1.8;
        for (let i = 0; i < density; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * radius;
            const px = x + Math.cos(angle) * dist;
            const py = y + Math.sin(angle) * dist;
            ctx.fillRect(px, py, 1.5, 1.5);
        }
    }

    function drawGlitter(x, y, size) {
        const density = Math.max(3, Math.floor(size / 3));
        const radius = size * 1.2;
        for (let i = 0; i < density; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * radius;
            const px = x + Math.cos(angle) * dist;
            const py = y + Math.sin(angle) * dist;
            ctx.fillStyle = glitterShade(currentColor);
            const dotSize = 1 + Math.random() * 2.5;
            ctx.beginPath();
            ctx.arc(px, py, dotSize, 0, Math.PI * 2);
            ctx.fill();
        }
        if (Math.random() < 0.4) spawnSparkle(x + (Math.random() - 0.5) * radius * 2, y + (Math.random() - 0.5) * radius * 2);
        if (Math.random() < 0.15) sounds.sparkle();
    }

    function stampSticker(x, y) {
        const fontSize = stickerFontSize();
        ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(currentSticker, x, y);
        sounds.plop();
    }

    // ---------- History / Undo ----------
    const MAX_HISTORY = 25;
    const history = [];

    function pushHistory() {
        try {
            history.push(canvas.toDataURL());
            if (history.length > MAX_HISTORY) history.shift();
            updateUndoButton();
        } catch (e) {}
    }

    function updateUndoButton() {
        undoBtn.disabled = history.length === 0;
    }

    function undo() {
        if (history.length === 0) return;
        const prev = history.pop();
        const img = new Image();
        img.onload = () => {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            saveToLocalStorage();
        };
        img.src = prev;
        sounds.undo();
        updateUndoButton();
    }

    // ---------- Drawing loop ----------
    function startDrawing(e) {
        getAudioCtx();
        pushHistory();
        isDrawing = true;
        const { x, y } = getPos(e);
        lastX = x;
        lastY = y;

        if (currentTool === 'sticker') {
            stickerPreview = { x, y };
            return;
        }

        draw(e, true);
    }

    function stopDrawing() {
        if (!isDrawing) return;
        if (currentTool === 'sticker' && stickerPreview) {
            stampSticker(stickerPreview.x, stickerPreview.y);
            if (mirrorMode) stampSticker(mx(stickerPreview.x), stickerPreview.y);
            stickerPreview = null;
        }
        isDrawing = false;
        saveToLocalStorage();
    }

    function draw(e, isStart = false) {
        if (!isDrawing) return;
        if (e.type && e.type.includes('touch')) e.preventDefault();
        const { x, y } = getPos(e);

        switch (currentTool) {
            case 'pen':
                drawPenSegment(lastX, lastY, x, y, currentColor, currentSize);
                if (mirrorMode) drawPenSegment(mx(lastX), lastY, mx(x), y, currentColor, currentSize);
                break;
            case 'eraser':
                drawPenSegment(lastX, lastY, x, y, '#FFFFFF', currentSize * 2.5);
                if (mirrorMode) drawPenSegment(mx(lastX), lastY, mx(x), y, '#FFFFFF', currentSize * 2.5);
                break;
            case 'rainbow': {
                const color = `hsl(${rainbowHue}, 100%, 55%)`;
                drawPenSegment(lastX, lastY, x, y, color, currentSize);
                if (mirrorMode) drawPenSegment(mx(lastX), lastY, mx(x), y, color, currentSize);
                rainbowHue = (rainbowHue + 8) % 360;
                break;
            }
            case 'spray':
                drawSpray(x, y, currentColor, currentSize);
                if (mirrorMode) drawSpray(mx(x), y, currentColor, currentSize);
                if (!isStart && Math.random() < 0.3) sounds.spray();
                break;
            case 'glitter':
                drawGlitter(x, y, currentSize);
                if (mirrorMode) drawGlitter(mx(x), y, currentSize);
                break;
            case 'sticker':
                stickerPreview = { x, y };
                break;
        }

        lastX = x;
        lastY = y;
    }

    // ---------- Canvas event listeners ----------
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', () => { if (isDrawing) stopDrawing(); });

    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
    canvas.addEventListener('touchcancel', stopDrawing);

    // ---------- Tool selection ----------
    const mirrorToggle = document.getElementById('mirrorToggle');
    mirrorToggle.addEventListener('click', () => {
        mirrorMode = !mirrorMode;
        mirrorToggle.classList.toggle('active', mirrorMode);
        sounds.swoosh();
    });

    toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toolButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTool = btn.dataset.tool;
            stickerPreview = null;
            sounds.swoosh();

            if (currentTool === 'sticker') {
                stickerPicker.classList.add('show');
            } else {
                stickerPicker.classList.remove('show');
            }
        });
    });

    // ---------- Color selection ----------
    colors.forEach(color => {
        color.addEventListener('click', () => {
            colors.forEach(c => c.classList.remove('active'));
            color.classList.add('active');
            currentColor = color.dataset.color;
            sounds.pop();
            if (currentTool === 'eraser' || currentTool === 'sticker') {
                document.querySelector('.tool-button[data-tool="pen"]').click();
            }
        });
    });

    // ---------- Brush size ----------
    sizes.forEach(size => {
        size.addEventListener('click', () => {
            sizes.forEach(s => s.classList.remove('active'));
            size.classList.add('active');
            currentSize = parseInt(size.dataset.size);
            sounds.click();
        });
    });

    // ---------- Sticker selection ----------
    stickers.forEach(sticker => {
        sticker.addEventListener('click', () => {
            stickers.forEach(s => s.classList.remove('active'));
            sticker.classList.add('active');
            currentSticker = sticker.dataset.sticker;
            sounds.plop();
        });
    });
    stickers[0].classList.add('active');

    // ---------- Clear modal ----------
    const modal = document.getElementById('clearModal');
    const confirmClearBtn = document.getElementById('confirmClear');
    const cancelClearBtn = document.getElementById('cancelClear');

    clearBtn.addEventListener('click', () => {
        modal.classList.add('show');
        sounds.click();
    });

    cancelClearBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        sounds.pop();
    });

    confirmClearBtn.addEventListener('click', () => {
        pushHistory();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        sparkles.length = 0;
        modal.classList.remove('show');
        localStorage.removeItem('savedDrawing');
        sounds.whoosh();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
    });

    // ---------- Undo ----------
    undoBtn.addEventListener('click', undo);

    // ---------- Save ----------
    saveBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = 'crtez.png';
        link.href = canvas.toDataURL();
        link.click();
        sounds.chirp();
    });

    // ---------- Initial selection states ----------
    colors[0].classList.add('active');
    sizes[0].classList.add('active');

    feather.replace();

    // ---------- Canvas sizing + persistence ----------
    function resizeCanvases() {
        const wrapper = canvas.parentElement;
        const w = wrapper.clientWidth;
        const h = wrapper.clientHeight;

        const saved = canvas.width > 0 ? canvas.toDataURL() : null;

        canvas.width = w;
        canvas.height = h;
        overlay.width = w;
        overlay.height = h;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);

        if (saved) {
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0);
            img.src = saved;
        } else {
            loadFromLocalStorage();
        }
    }

    function saveToLocalStorage() {
        try {
            localStorage.setItem('savedDrawing', canvas.toDataURL());
        } catch (e) {}
    }

    function loadFromLocalStorage() {
        const saved = localStorage.getItem('savedDrawing');
        if (saved) {
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0);
            img.src = saved;
        }
    }

    resizeCanvases();

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resizeCanvases, 150);
    });

    window.addEventListener('beforeunload', saveToLocalStorage);
});
