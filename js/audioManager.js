import { formatTime, decodeAudio } from './utils.js';

export function createAudioManager() {
    let audioFile = null;
    let audioUrl = null;
    let audioBuffer = null;
    let audioDuration = 0;
    let trimStart = 0;
    let trimEnd = 0;
    let onUpdate = () => {};
    let previewSource = null;
    let previewCtx = null;

    const musicUrlInput = document.getElementById('musicUrlInput');
    const loadUrlBtn = document.getElementById('loadUrlBtn');
    const musicFileInput = document.getElementById('musicFileInput');
    const musicStatus = document.getElementById('musicStatus');
    const audioPlayer = document.getElementById('audioPlayer');
    const trimSection = document.getElementById('trimSection');
    const trimStartRange = document.getElementById('trimStart');
    const trimEndRange = document.getElementById('trimEnd');
    const trimStartVal = document.getElementById('trimStartVal');
    const trimEndVal = document.getElementById('trimEndVal');
    const trimDurationSpan = document.getElementById('trimDuration');
    const audioTotalDurationSpan = document.getElementById('audioTotalDuration');
    const waveformContainer = document.getElementById('waveformContainer');
    const waveformCanvas = document.getElementById('waveformCanvas');
    const previewAudioBtn = document.getElementById('previewAudioBtn');
    const stopAudioPreviewBtn = document.getElementById('stopAudioPreviewBtn');

    if (!musicFileInput || !audioPlayer) {
        console.error('[audioManager] Не знайдено DOM-елементи');
        return {
            getAudioBuffer: () => null,
            getTrimRange: () => ({ start: 0, end: 0 }),
            getDuration: () => 0,
            hasAudio: () => false,
            setOnUpdate: () => {},
        };
    }

    function setOnUpdate(cb) {
        onUpdate = typeof cb === 'function' ? cb : () => {};
        onUpdate();
    }

    function notify() {
        try { onUpdate(); } catch (e) { console.error('[audioManager] onUpdate error:', e); }
    }

    async function loadFromFile(file) {
        try {
            musicStatus.textContent = 'Обробка файлу...';
            await setupAudio(file);
        } catch (err) {
            musicStatus.textContent = '❌ Помилка: ' + err.message;
            console.error('[audioManager] loadFromFile', err);
        }
    }

    async function loadFromUrl(url) {
        try {
            musicStatus.textContent = 'Завантаження...';
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const blob = await response.blob();
            await setupAudio(blob);
        } catch (err) {
            musicStatus.textContent = '❌ Помилка: ' + err.message + ' (перевірте CORS)';
            console.error('[audioManager] loadFromUrl', err);
        }
    }

    async function setupAudio(blob) {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        audioFile = blob;
        audioUrl = URL.createObjectURL(blob);
        audioPlayer.src = audioUrl;
        audioPlayer.style.display = 'block';

        // Декодування
        try {
            audioBuffer = await decodeAudio(blob);
            audioDuration = audioBuffer.duration;
        } catch (err) {
            console.warn('[audioManager] decodeAudio failed, fallback to element');
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Таймаут метаданих аудіо')), 10000);
                audioPlayer.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
                audioPlayer.onerror = () => { clearTimeout(timeout); reject(new Error('Помилка аудіо')); };
            });
            audioDuration = audioPlayer.duration;
            if (!isFinite(audioDuration) || audioDuration <= 0) {
                throw new Error('Не вдалось визначити тривалість аудіо');
            }
        }

        trimStart = 0;
        trimEnd = audioDuration;
        trimStartRange.max = audioDuration;
        trimEndRange.max = audioDuration;
        trimStartRange.value = 0;
        trimEndRange.value = audioDuration;

        trimSection.style.display = 'block';
        waveformContainer.style.display = 'block';
        musicStatus.textContent = `✅ ${blob.name || 'Аудіо'} (${formatTime(audioDuration)})`;

        // Малюємо хвилю після того, як контейнер став видимим
        requestAnimationFrame(() => {
            drawWaveform();
            updateTrimUI();
        });

        notify();
    }

    function drawWaveform() {
        if (!audioBuffer || !waveformCanvas) return;
        const rect = waveformCanvas.getBoundingClientRect();
        if (rect.width < 10) return; // контейнер ще не відрендерився

        const dpr = window.devicePixelRatio || 1;
        waveformCanvas.width = rect.width * dpr;
        waveformCanvas.height = 80 * dpr;
        const ctx = waveformCanvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = 80;
        const data = audioBuffer.getChannelData(0);
        const step = Math.max(1, Math.ceil(data.length / w));
        const amp = h / 2;

        ctx.fillStyle = '#10121c';
        ctx.fillRect(0, 0, w, h);

        // Підсвітка вибраного фрагмента
        const startX = (trimStart / audioDuration) * w;
        const endX = (trimEnd / audioDuration) * w;
        ctx.fillStyle = 'rgba(108, 124, 255, 0.15)';
        ctx.fillRect(startX, 0, endX - startX, h);

        ctx.strokeStyle = '#6c7cff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < w; i++) {
            let min = 1.0, max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[i * step + j];
                if (datum === undefined) continue;
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            ctx.moveTo(i + 0.5, (1 + min) * amp);
            ctx.lineTo(i + 0.5, (1 + max) * amp);
        }
        ctx.stroke();

        // Межі
        ctx.strokeStyle = '#8f7aff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX, 0); ctx.lineTo(startX, h);
        ctx.moveTo(endX, 0); ctx.lineTo(endX, h);
        ctx.stroke();
    }

    function updateTrimUI() {
        trimStartVal.textContent = formatTime(trimStart);
        trimEndVal.textContent = formatTime(trimEnd);
        trimDurationSpan.textContent = formatTime(Math.max(0, trimEnd - trimStart));
        audioTotalDurationSpan.textContent = `Тривалість: ${formatTime(audioDuration)}`;
        if (parseFloat(trimStartRange.value) !== trimStart) trimStartRange.value = trimStart;
        if (parseFloat(trimEndRange.value) !== trimEnd) trimEndRange.value = trimEnd;
        drawWaveform();
        notify();
    }

    trimStartRange.addEventListener('input', e => {
        let val = parseFloat(e.target.value);
        if (val >= trimEnd) val = trimEnd - 0.1;
        trimStart = Math.max(0, val);
        updateTrimUI();
    });

    trimEndRange.addEventListener('input', e => {
        let val = parseFloat(e.target.value);
        if (val <= trimStart) val = trimStart + 0.1;
        trimEnd = Math.min(audioDuration, val);
        updateTrimUI();
    });

    async function playTrimmedPreview() {
        if (!audioBuffer) return;
        stopTrimmedPreview();
        try {
            previewCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = previewCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(previewCtx.destination);
            source.start(0, trimStart, trimEnd - trimStart);
            previewSource = source;
            previewAudioBtn.style.display = 'none';
            stopAudioPreviewBtn.style.display = 'inline-flex';
            source.onended = () => {
                previewAudioBtn.style.display = 'inline-flex';
                stopAudioPreviewBtn.style.display = 'none';
            };
        } catch (err) {
            console.error('[audioManager] playTrimmedPreview', err);
        }
    }

    function stopTrimmedPreview() {
        if (previewSource) {
            try { previewSource.stop(); } catch (e) {}
            previewSource = null;
        }
        if (previewCtx) {
            previewCtx.close().catch(() => {});
            previewCtx = null;
        }
        if (previewAudioBtn) previewAudioBtn.style.display = 'inline-flex';
        if (stopAudioPreviewBtn) stopAudioPreviewBtn.style.display = 'none';
    }

    previewAudioBtn.addEventListener('click', playTrimmedPreview);
    stopAudioPreviewBtn.addEventListener('click', stopTrimmedPreview);

    musicFileInput.addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) loadFromFile(e.target.files[0]);
        e.target.value = '';
    });

    loadUrlBtn.addEventListener('click', () => {
        const url = musicUrlInput.value.trim();
        if (url) loadFromUrl(url);
    });

    window.addEventListener('resize', () => {
        if (audioBuffer) drawWaveform();
    });

    return {
        getAudioBuffer: () => audioBuffer,
        getTrimRange: () => ({ start: trimStart, end: trimEnd }),
        getDuration: () => audioDuration,
        hasAudio: () => !!audioBuffer && audioDuration > 0,
        setOnUpdate,
    };
}