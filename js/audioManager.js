import { formatTime, decodeAudio } from './utils.js';

export function createAudioManager() {
    let audioFile = null;
    let audioUrl = null;
    let audioBuffer = null;
    let audioDuration = 0;
    let trimStart = 0;
    let trimEnd = 0;

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
    const stopPreviewBtn = document.getElementById('stopPreviewBtn');

    let previewSource = null;
    let previewCtx = null;
    let isPreviewPlaying = false;
    let onUpdate = () => {};

    function setOnUpdate(cb) { onUpdate = cb; }

    async function loadFromFile(file) {
        try {
            musicStatus.textContent = 'Обробка файлу...';
            await setupAudio(file);
        } catch (err) {
            musicStatus.textContent = '❌ Помилка: ' + err.message;
        }
    }

    async function loadFromUrl(url) {
        try {
            musicStatus.textContent = 'Завантаження...';
            const response = await fetch(url);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const blob = await response.blob();
            await setupAudio(blob);
        } catch (err) {
            musicStatus.textContent = '❌ Помилка: ' + err.message + ' (перевірте CORS)';
        }
    }

    async function setupAudio(blob) {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        audioFile = blob;
        audioUrl = URL.createObjectURL(blob);
        audioPlayer.src = audioUrl;
        audioPlayer.style.display = 'block';

        // Декодуємо для отримання тривалості та хвилі
        try {
            audioBuffer = await decodeAudio(blob);
            audioDuration = audioBuffer.duration;
        } catch (err) {
            // Фолбек: через аудіо-елемент
            await new Promise((resolve, reject) => {
                audioPlayer.onloadedmetadata = resolve;
                audioPlayer.onerror = () => reject(new Error('Не вдалось завантажити аудіо'));
            });
            audioDuration = audioPlayer.duration;
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

        drawWaveform();
        updateTrimUI();
        onUpdate();
    }

    function drawWaveform() {
        if (!audioBuffer) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = waveformCanvas.getBoundingClientRect();
        waveformCanvas.width = rect.width * dpr;
        waveformCanvas.height = 80 * dpr;
        const ctx = waveformCanvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = 80;
        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / w);
        const amp = h / 2;

        ctx.fillStyle = '#10121c';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = '#6c7cff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < w; i++) {
            let min = 1.0, max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[i * step + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            ctx.moveTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }
        ctx.stroke();

        // Підсвітка вибраного фрагмента
        const startX = (trimStart / audioDuration) * w;
        const endX = (trimEnd / audioDuration) * w;
        ctx.fillStyle = 'rgba(108, 124, 255, 0.15)';
        ctx.fillRect(startX, 0, endX - startX, h);
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
        onUpdate();
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

    // Прослуховування фрагмента
    async function playTrimmedPreview() {
        if (!audioBuffer) return;
        stopTrimmedPreview();
        previewCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = previewCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(previewCtx.destination);
        source.start(0, trimStart, trimEnd - trimStart);
        previewSource = source;
        isPreviewPlaying = true;
        previewAudioBtn.style.display = 'none';
        stopPreviewBtn.style.display = 'inline-flex';
        source.onended = () => {
            isPreviewPlaying = false;
            previewAudioBtn.style.display = 'inline-flex';
            stopPreviewBtn.style.display = 'none';
        };
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
        isPreviewPlaying = false;
        previewAudioBtn.style.display = 'inline-flex';
        stopPreviewBtn.style.display = 'none';
    }

    previewAudioBtn.addEventListener('click', playTrimmedPreview);
    stopPreviewBtn.addEventListener('click', stopTrimmedPreview);

    musicFileInput.addEventListener('change', e => {
        if (e.target.files[0]) loadFromFile(e.target.files[0]);
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
        playTrimmedPreview,
        stopTrimmedPreview,
    };
}