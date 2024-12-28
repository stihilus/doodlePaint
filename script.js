document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const colors = document.querySelectorAll('.color');
    const sizes = document.querySelectorAll('.size');
    const clearBtn = document.getElementById('clear');
    const saveBtn = document.getElementById('save');

    // Set canvas size
    canvas.width = 800;
    canvas.height = 600;

    // Default values
    let isDrawing = false;
    let currentColor = '#000000';
    let currentSize = 5;

    // Initialize white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Drawing functions
    function startDrawing(e) {
        isDrawing = true;
        draw(e);
    }

    function stopDrawing() {
        isDrawing = false;
        ctx.beginPath();
    }

    function draw(e) {
        if (!isDrawing) return;

        // Get coordinates for both mouse and touch events
        const rect = canvas.getBoundingClientRect();
        let x, y;
        
        if (e.type.includes('touch')) {
            // Prevent scrolling while drawing
            e.preventDefault();
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        }

        ctx.lineWidth = currentSize;
        ctx.lineCap = 'round';
        ctx.strokeStyle = currentColor;

        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);

        // Save to local storage after each stroke
        saveToLocalStorage();
    }

    // Event listeners for mouse drawing
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Event listeners for touch drawing
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
    canvas.addEventListener('touchcancel', stopDrawing);

    // Prevent default touch behavior to avoid scrolling while drawing
    canvas.addEventListener('touchstart', (e) => e.preventDefault());

    // Color selection
    colors.forEach(color => {
        color.addEventListener('click', () => {
            // Remove active class from all colors
            colors.forEach(c => c.classList.remove('active'));
            // Add active class to selected color
            color.classList.add('active');
            currentColor = color.dataset.color;
        });
    });

    // Brush size selection
    sizes.forEach(size => {
        size.addEventListener('click', () => {
            // Remove active class from all sizes
            sizes.forEach(s => s.classList.remove('active'));
            // Add active class to selected size
            size.classList.add('active');
            currentSize = parseInt(size.dataset.size);
        });
    });

    // Replace the clear button event listener with this
    const modal = document.getElementById('clearModal');
    const confirmClearBtn = document.getElementById('confirmClear');
    const cancelClearBtn = document.getElementById('cancelClear');

    clearBtn.addEventListener('click', () => {
        modal.classList.add('show');
    });

    cancelClearBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    confirmClearBtn.addEventListener('click', () => {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        modal.classList.remove('show');
        // Clear local storage when canvas is cleared
        localStorage.removeItem('savedDrawing');
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    // Save drawing
    saveBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = 'drawing.png';
        link.href = canvas.toDataURL();
        link.click();
    });

    // Set initial active states
    colors[0].classList.add('active');
    sizes[0].classList.add('active');

    // Initialize Feather icons
    feather.replace();

    // Update canvas size function
    function updateCanvasSize() {
        // Store the current drawing
        const tempDrawing = canvas.toDataURL();
        
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        
        // Redraw white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Restore the drawing
        const img = new Image();
        img.onload = function() {
            ctx.drawImage(img, 0, 0);
        };
        img.src = tempDrawing;
    }

    // Set initial canvas size
    updateCanvasSize();

    // Update canvas size when window is resized
    window.addEventListener('resize', updateCanvasSize);

    // Add these functions for local storage handling
    function saveToLocalStorage() {
        const drawingData = canvas.toDataURL();
        localStorage.setItem('savedDrawing', drawingData);
    }

    function loadFromLocalStorage() {
        const savedDrawing = localStorage.getItem('savedDrawing');
        if (savedDrawing) {
            const img = new Image();
            img.onload = function() {
                ctx.drawImage(img, 0, 0);
            };
            img.src = savedDrawing;
        }
    }

    // Load saved drawing when page loads
    loadFromLocalStorage();

    // Add window unload event to save drawing before closing
    window.addEventListener('beforeunload', saveToLocalStorage);
}); 