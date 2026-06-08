// Controller UI & Input Logic
window.submitControllerName = function () {
    const nameInput = document.getElementById('cn-input');
    const v = nameInput.value.trim();
    if (v) {
        cvSend({ a: 'name', n: v });
        document.getElementById('cv-name').innerText = v;
    }
    document.getElementById('controller-name-prompt').classList.add('hidden');
    document.getElementById('controller-name-prompt').classList.remove('flex');
    showControllerView();
};

let joystickManager = null;

function showControllerView() {
    const cv = document.getElementById('controller-view');
    cv.classList.remove('hidden'); 
    cv.classList.add('flex');
    
    // Prevent zooming/scrolling
    document.body.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });
    
    // Setup Virtual Joystick (Nipple.js)
    const zone = document.getElementById('joystick-zone');
    joystickManager = nipplejs.create({
        zone: zone,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: '#6366f1',
        size: 100
    });

    joystickManager.on('move', (evt, data) => {
        // Normalize x/y between -1 and 1
        const x = Math.cos(data.angle.radian) * (data.distance / 50);
        const y = -Math.sin(data.angle.radian) * (data.distance / 50);
        cvSend({ a: 'move', x: x, y: y });
    });

    joystickManager.on('end', () => {
        cvSend({ a: 'move', x: 0, y: 0 });
    });

    // Setup Jump Button
    const jumpBtn = document.getElementById('cv-jump');
    
    const startJump = (e) => {
        e.preventDefault();
        if (navigator.vibrate) navigator.vibrate(15);
        jumpBtn.classList.add('scale-90', 'bg-indigo-700');
        cvSend({ a: 'jump', state: true });
    };
    
    const endJump = (e) => {
        e.preventDefault();
        jumpBtn.classList.remove('scale-90', 'bg-indigo-700');
        cvSend({ a: 'jump', state: false });
    };

    jumpBtn.addEventListener('touchstart', startJump, { passive: false });
    jumpBtn.addEventListener('mousedown', startJump);
    jumpBtn.addEventListener('touchend', endJump);
    jumpBtn.addEventListener('mouseup', endJump);
    jumpBtn.addEventListener('mouseleave', endJump);
    
    // Fallback keyboard controls for testing on desktop
    window.addEventListener('keydown', e => {
        if (e.code === 'Space') cvSend({ a: 'jump', state: true });
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') cvSend({ a: 'move', x: -1, y: 0 });
        if (e.code === 'ArrowRight' || e.code === 'KeyD') cvSend({ a: 'move', x: 1, y: 0 });
    });
    window.addEventListener('keyup', e => {
        if (e.code === 'Space') cvSend({ a: 'jump', state: false });
        if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) cvSend({ a: 'move', x: 0, y: 0 });
    });
}
