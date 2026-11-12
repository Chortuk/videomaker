import { getSupportedMimeType, getFileExtension, isMediaRecorderSupported } from './utils.js';

export function createExporter(photoManager, audioManager) {
    const exportBtn = document.getElementById('exportBtn');
    const stopExportBtn = document.getElementById('stopExportBtn');
    const exportProgress = document.getElementById('exportProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const exportStatus = document.getElementById('exportStatus');
    const downloadContainer = document.getElementById('downloadContainer');
    const previewCanvas = document.getElementById('previewCanvas');
    const playPreviewBtn = document.getElementById('playPreviewBtn');
    const stopPreviewBtn = document.getElementById('stopPreviewBtn');
    const previewStatus = document.getElementById('previewStatus');

    const transitionTypeSelect = document.getElementById('transitionType');
    const transitionDurationRange = document.getElementById('transitionDuration');
    const transitionDurationVal = document.getElementById('transitionDurationVal');
    const videoResolutionSelect = document.getElementById('videoResolution');
    const videoFpsSelect = document.getElementById('videoFps');
    const videoFormatSelect = document.getElementById('videoFormat');

    if (!exportBtn || !previewCanvas) {
        console.error('[exporter] Не знайдено DOM-елементи');
        return { checkReady: () => {} };
    }

    let isExporting = false;
    let cancelExport = false;
    let isPreviewing = false;
    let cancelPreview = false;
    let previewState = null;

    if (transitionDurationRange) {
        transitionDurationRange.addEventListener('input', () => {
            transitionDurationVal.textContent = transitionDurationRange.value + ' с';
        });
    }

    // Перепроверка готовності при зміні налаштувань
    [transitionTypeSelect, videoResolutionSelect, videoFpsSelect, videoFormatSelect].forEach(el => {
        if (el) el.addEventListener('change', () => checkReady());
    });

    function getSettings() {
        const [w, h] = videoResolutionSelect.value.split('x').map(Number);
        return {
            width: w,
            height: h,
            fps: parseInt(videoFpsSelect.value),
            transition: transitionTypeSelect.value,
            transitionDuration: parseFloat(transitionDurationRange.value),
            format: videoFormatSelect.value,
        };
    }

    function drawFrame(ctx, img, x, y, w, h) {
        if (!img || !img.width || !img.height) return;
        const imgRatio = img.width / img.height;
        const canvasRatio = w / h;
        let drawW, drawH, drawX, drawY;
        if (imgRatio > canvasRatio) {
            drawW = w;
            drawH = w / imgRatio;
            drawX = 0;
            drawY = (h - drawH) / 2;
        } else {
            drawH = h;
            drawW = h * imgRatio;
            drawX = (w - drawW) / 2;
            drawY = 0;
        }
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
    }

    function renderTransition(ctx, imgA, imgB, progress, settings) {
        const { width: w, height: h, transition } = settings;
        ctx.save();
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        if (transition === 'none' || !imgB) {
            drawFrame(ctx, imgA, 0, 0, w, h);
            ctx.restore();
            return;
        }

        const p = Math.min(1, Math.max(0, progress));

        if (transition === 'fade') {
            drawFrame(ctx, imgA, 0, 0, w, h);
            ctx.globalAlpha = p;
            drawFrame(ctx, imgB, 0, 0, w, h);
            ctx.globalAlpha = 1;
        } else if (transition === 'slide-left') {
            ctx.save(); ctx.translate(-w * p, 0); drawFrame(ctx, imgA, 0, 0, w, h); ctx.restore();
            ctx.save(); ctx.translate(w * (1 - p), 0); drawFrame(ctx, imgB, 0, 0, w, h); ctx.restore();
        } else if (transition === 'slide-right') {
            ctx.save(); ctx.translate(w * p, 0); drawFrame(ctx, imgA, 0, 0, w, h); ctx.restore();
            ctx.save(); ctx.translate(-w * (1 - p), 0); drawFrame(ctx, imgB, 0, 0, w, h); ctx.restore();
        } else if (transition === 'zoom-in') {
            drawFrame(ctx, imgA, 0, 0, w, h);
            const scale = 1 + p * 0.5;
            ctx.globalAlpha = p;
            ctx.save();
            ctx.translate(w / 2, h / 2);
            ctx.scale(scale, scale);
            ctx.translate(-w / 2, -h / 2);
            drawFrame(ctx, imgB, 0, 0, w, h);
            ctx.restore();
            ctx.globalAlpha = 1;
        } else if (transition === 'zoom-out') {
            const scale = 1.5 - p * 0.5;
            ctx.save();
            ctx.translate(w / 2, h / 2);
            ctx.scale(scale, scale);
            ctx.translate(-w / 2, -h / 2);
            drawFrame(ctx, imgA, 0, 0, w, h);
            ctx.restore();
            ctx.globalAlpha = p;
            drawFrame(ctx, imgB, 0, 0, w, h);
            ctx.globalAlpha = 1;
        } else {
            drawFrame(ctx, imgA, 0, 0, w, h);
        }
        ctx.restore();
    }

    function buildTimeline(images, settings) {
        const transDur = settings.transition === 'none'
            ? 0
            : Math.min(settings.transitionDuration, Math.min(...images.map(i => i.duration / 2)));
        const timeline = [];
        let t = 0;
        for (let i = 0; i < images.length; i++) {
            const dur = images[i].duration;
            timeline.push({ imgIndex: i, start: t, end: t + dur, duration: dur });
            t += dur;
        }
        return { timeline, totalDuration: t, transDur };
    }

    function getFrameAtTime(time, images, timeline, settings, transDur) {
        if (images.length === 0) return null;
        for (let i = 0; i < timeline.length; i++) {
            const seg = timeline[i];
            if (time >= seg.start && time < seg.end) {
                const localT = time - seg.start;
                const img = images[seg.imgIndex].img;
                if (i > 0 && localT < transDur && transDur > 0) {
                    const prevImg = images[timeline[i - 1].imgIndex].img;
                    return { imgA: prevImg, imgB: img, progress: localT / transDur };
                }
                if (i < timeline.length - 1 && (seg.end - time) < transDur && transDur > 0) {
                    const nextImg = images[timeline[i + 1].imgIndex].img;
                    return { imgA: img, imgB: nextImg, progress: 1 - ((seg.end - time) / transDur) };
                }
                return { imgA: img, imgB: null, progress: 0 };
            }
        }
        const last = images[images.length - 1].img;
        return { imgA: last, imgB: null, progress: 0 };
    }

    // ----- Попередній перегляд -----
    async function playPreview() {
        if (isPreviewing) return;
        const images = await photoManager.getLoadedImages();
        const audioBuffer = audioManager.getAudioBuffer();
        if (images.length === 0) { previewStatus.textContent = 'Додайте фото.'; return; }
        if (!audioBuffer) { previewStatus.textContent = 'Додайте музику.'; return; }

        const settings = getSettings();
        const { timeline, totalDuration, transDur } = buildTimeline(images, settings);
        const trim = audioManager.getTrimRange();

        previewCanvas.width = 480;
        previewCanvas.height = 270;
        const ctx = previewCanvas.getContext('2d');

        isPreviewing = true;
        cancelPreview = false;
        playPreviewBtn.style.display = 'none';
        stopPreviewBtn.style.display = 'inline-flex';
        previewStatus.textContent = '▶ Відтворення...';

        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.loop = true;
            source.loopStart = trim.start;
            source.loopEnd = trim.end;
            source.connect(audioCtx.destination);

            const startTime = audioCtx.currentTime;
            source.start(startTime, trim.start);

            let animId = null;
            let lastFrameTime = performance.now();
            const fps = 30;

            function loop() {
                if (cancelPreview) return;
                const now = performance.now();
                if (now - lastFrameTime < 1000 / fps) {
                    animId = requestAnimationFrame(loop);
                    return;
                }
                lastFrameTime = now;
                const elapsed = audioCtx.currentTime - startTime;
                if (elapsed >= totalDuration) {
                    stopPreview();
                    return;
                }
                const frame = getFrameAtTime(elapsed, images, timeline, settings, transDur);
                if (frame) renderTransition(ctx, frame.imgA, frame.imgB, frame.progress, settings);
                animId = requestAnimationFrame(loop);
            }
            animId = requestAnimationFrame(loop);

            previewState = { audioCtx, source, animId };
        } catch (err) {
            console.error('[exporter] playPreview', err);
            previewStatus.textContent = '❌ Помилка прев\'ю: ' + err.message;
            stopPreview();
        }
    }

    function stopPreview() {
        cancelPreview = true;
        isPreviewing = false;
        if (previewState) {
            try { previewState.source.stop(); } catch (e) {}
            try { previewState.audioCtx.close(); } catch (e) {}
            if (previewState.animId) cancelAnimationFrame(previewState.animId);
            previewState = null;
        }
        playPreviewBtn.style.display = 'inline-flex';
        stopPreviewBtn.style.display = 'none';
        previewStatus.textContent = 'Зупинено.';
    }

    playPreviewBtn.addEventListener('click', playPreview);
    stopPreviewBtn.addEventListener('click', stopPreview);

    // ----- Експорт -----
    async function exportVideo() {
        if (isExporting) return;
        if (!isMediaRecorderSupported()) {
            exportStatus.textContent = '❌ MediaRecorder не підтримується вашим браузером.';
            return;
        }
        const images = await photoManager.getLoadedImages();
        const audioBuffer = audioManager.getAudioBuffer();
        if (images.length === 0) { exportStatus.textContent = 'Додайте фото.'; return; }
        if (!audioBuffer) { exportStatus.textContent = 'Додайте музику.'; return; }

        const settings = getSettings();
        const mimeType = getSupportedMimeType(settings.format);
        if (!mimeType) {
            exportStatus.textContent = '❌ Браузер не підтримує жодного формату.';
            return;
        }

        const { timeline, totalDuration, transDur } = buildTimeline(images, settings);
        const trim = audioManager.getTrimRange();

        isExporting = true;
        cancelExport = false;
        exportBtn.disabled = true;
        stopExportBtn.style.display = 'inline-flex';
        exportProgress.style.display = 'block';
        downloadContainer.innerHTML = '';
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        exportStatus.textContent = 'Підготовка аудіо...';

        let audioCtx = null;

        try {
            // Рендеринг аудіо з зацикленням
            const sampleRate = audioBuffer.sampleRate;
            const startSample = Math.floor(trim.start * sampleRate);
            const endSample = Math.floor(trim.end * sampleRate);
            const clipLength = endSample - startSample;
            if (clipLength <= 0) throw new Error('Порожній фрагмент аудіо');
            const totalSamples = Math.ceil(totalDuration * sampleRate);

            const offlineCtx = new OfflineAudioContext(1, totalSamples, sampleRate);
            const source = offlineCtx.createBufferSource();
            const trimmedBuffer = offlineCtx.createBuffer(1, clipLength, sampleRate);
            const originalData = audioBuffer.getChannelData(0);
            const trimmedData = trimmedBuffer.getChannelData(0);
            for (let i = 0; i < clipLength; i++) trimmedData[i] = originalData[startSample + i] || 0;
            source.buffer = trimmedBuffer;
            source.loop = true;
            source.loopStart = 0;
            source.loopEnd = clipLength / sampleRate;
            source.connect(offlineCtx.destination);
            source.start(0);

            const renderedBuffer = await offlineCtx.startRendering();
            if (cancelExport) throw new Error('Скасовано');

            // Canvas і потік
            const canvas = document.createElement('canvas');
            canvas.width = settings.width;
            canvas.height = settings.height;
            const ctx = canvas.getContext('2d');
            const stream = canvas.captureStream(settings.fps);

            // Аудіотрек
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const audioDest = audioCtx.createMediaStreamDestination();
            const audioSource = audioCtx.createBufferSource();
            audioSource.buffer = renderedBuffer;
            audioSource.connect(audioDest);
            audioDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));

            const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
            const chunks = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            const recordingDone = new Promise(resolve => { recorder.onstop = resolve; });

            recorder.start();
            audioSource.start(0);

            exportStatus.textContent = 'Рендеринг відео (реальний час)...';

            const startTime = performance.now();
            const fps = settings.fps;

            await new Promise(resolve => {
                function frame() {
                    if (cancelExport) { resolve(); return; }
                    const elapsed = (performance.now() - startTime) / 1000;
                    if (elapsed >= totalDuration) { resolve(); return; }

                    const f = getFrameAtTime(elapsed, images, timeline, settings, transDur);
                    if (f) renderTransition(ctx, f.imgA, f.imgB, f.progress, settings);

                    const pct = Math.min(100, (elapsed / totalDuration) * 100);
                    progressFill.style.width = pct + '%';
                    progressText.textContent = Math.round(pct) + '%';

                    setTimeout(frame, 1000 / fps);
                }
                frame();
            });

            recorder.stop();
            try { audioSource.stop(); } catch (e) {}
            await recordingDone;

            stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });

            if (cancelExport) {
                exportStatus.textContent = '⏹ Експорт скасовано.';
            } else {
                const blob = new Blob(chunks, { type: mimeType });
                const ext = getFileExtension(mimeType);
                const url = URL.createObjectURL(blob);
                const filename = `slideshow-${Date.now()}.${ext}`;
                downloadContainer.innerHTML = `
                    <a class="download-link" href="${url}" download="${filename}">
                        ⬇ Завантажити ${ext.toUpperCase()} (${(blob.size / 1024 / 1024).toFixed(1)} МБ)
                    </a>
                `;
                exportStatus.textContent = '✅ Відео готове!';
                progressFill.style.width = '100%';
                progressText.textContent = '100%';
            }
        } catch (err) {
            console.error('[exporter] exportVideo', err);
            if (err.message === 'Скасовано') {
                exportStatus.textContent = '⏹ Експорт скасовано.';
            } else {
                exportStatus.textContent = '❌ Помилка: ' + err.message;
            }
        } finally {
            if (audioCtx) { try { audioCtx.close(); } catch (e) {} }
            isExporting = false;
            exportBtn.disabled = false;
            stopExportBtn.style.display = 'none';
            checkReady();
        }
    }

    stopExportBtn.addEventListener('click', () => { cancelExport = true; });
    exportBtn.addEventListener('click', exportVideo);

    function checkReady() {
        const hasPhotos = photoManager.hasPhotos();
        const hasAudio = audioManager.hasAudio();
        const trim = audioManager.getTrimRange();
        const hasTrim = (trim.end - trim.start) > 0.2;
        const ready = hasPhotos && hasAudio && hasTrim;

        exportBtn.disabled = !ready || isExporting;
        playPreviewBtn.disabled = !ready || isPreviewing;

        if (!ready) {
            if (!hasPhotos) exportStatus.textContent = 'Додайте хоча б одне фото.';
            else if (!hasAudio) exportStatus.textContent = 'Додайте музику.';
            else exportStatus.textContent = 'Виберіть фрагмент музики (мін. 0.5 с).';
        } else {
            exportStatus.textContent = '✅ Готово до експорту!';
        }
    }

    photoManager.setOnUpdate(checkReady);
    audioManager.setOnUpdate(checkReady);
    checkReady();

    return { checkReady };
}