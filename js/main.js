import { createPhotoManager } from './photoManager.js';
import { createAudioManager } from './audioManager.js';
import { createExporter } from './exporter.js';

window.addEventListener('error', e => {
    console.error('[GLOBAL ERROR]', e.message, 'at', e.filename, ':', e.lineno);
});

window.addEventListener('unhandledrejection', e => {
    console.error('[UNHANDLED PROMISE]', e.reason);
});

function init() {
    try {
        console.log('[main] Ініціалізація...');
        const photoManager = createPhotoManager();
        const audioManager = createAudioManager();
        createExporter(photoManager, audioManager);
        console.log('✅ Слайд-шоу Студія готова');
    } catch (err) {
        console.error('[main] Помилка ініціалізації:', err);
        const status = document.getElementById('exportStatus');
        if (status) status.textContent = '❌ Помилка ініціалізації: ' + err.message;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}