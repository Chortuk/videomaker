import { getSupportedMimeType, getFileExtension, formatTime } from './utils.js';

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

    let isExporting = false;
    let cancelExport = false;
    let isPreviewing = false;
    let cancelPreview = false;

    transitionDurationRange.addEventListener('input', () => {
        transitionDurationVal.textContent = transitionDurationRange.value + ' с';
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
        // Малюємо зображення зі збереженням пропорцій (contain)
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

    function renderTransition(ctx, imgA, imgB, progress, settings, globalAlphaA = 1) {
        const { width: w, height: h, transition } = settings;
        ctx.save();
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        if (transition === 'none' || !imgB) {
            ctx.globalAlpha = globalAlphaA;
            drawFrame(ctx, imgA, 0, 0, w, h);
            ctx.globalAlpha = 1;
            ctx.restore();
            return;
        }

        const p = Math.min(1, Math.max(0, progress));

        if (transition === 'fade') {
            ctx.globalAlpha = 1;
            drawFrame(ctx, imgA, 0, 0, w, h);
            ctx.globalAlpha = p;
            drawFrame(ctx, imgB, 0, 0, w, h);
            ctx.globalAlpha = 1;
        } else if (transition === 'slide-left') {
            const offsetA = -w * p;
            const offsetB = w * (1 - p);
            ctx.save(); ctx.translate(offsetA, 0); drawFrame(ctx, imgA, 0, 0, w, h); ctx.restore();
            ctx.save(); ctx.translate(offsetB, 0); drawFrame(ctx, imgB, 0, 0, w, h); ctx.restore();
        } else if (transition === 'slide-right') {
            const offsetA = w * p;
            const offsetB = -w * (1 - p);
            ctx.save(); ctx.translate(offsetA, 0); drawFrame(ctx, imgA, 0, 0, w, h); ctx.restore();
            ctx.save(); ctx.translate(offsetB, 0); drawFrame(ctx, imgB, 0, 0, w, h); ctx.restore();
        } else if (transition === 'zoom-in') {
            ctx.globalAlpha = 1;
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
            ctx.globalAlpha = 1;
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
        }
        ctx.restore();
    }

    // Обчислення часу відображення кожного фото та переходу
    function buildTimeline(images, settings) {
        const timeline = [];
        const transDur = settings.transition === 'none' ? 0 : Math.min(settings.transitionDuration, Math.min(...images.map(i => i.duration / 2)));
        let t = 0;
        for (let i = 0; i < images.length; i++) {
            const dur = images[i].duration;
            timeline.push({ imgIndex: i, start: t, end: t + dur, duration: dur });
            t += dur;
        }
        return { timeline, totalDuration: t, transDur };
    }

    function getFrameAtTime(time, images, timeline, settings) {
        const transDur = settings.transition === 'none' ? 0 : Math.min(settings.transitionDuration, Math.min(...images.map(i => i.duration / 2)));
        // Знайти активний сегмент
        for (let i = 0; i < timeline.length; i++) {
            const seg = timeline[i];
            if (time >= seg.start && time < seg.end) {
                const localT = time - seg.start;
                const img = images[seg.imgIndex].img;

                // Перевірка переходу на початку сегмента (перехід з попереднього)
                if (i > 0 && localT < transDur && transDur > 0) {
                    const prevImg = images[timeline[i - 1].imgIndex].img;
                    const progress = localT / transDur;
                    return { imgA: prevImg, imgB: img, progress };
                }
                // Перевірка переходу в кінці сегмента (перехід до наступного)
                if (i < timeline.length - 1 && (seg.end - time) < transDur && transDur > 0) {
                    const nextImg = images[timeline[i + 1].imgIndex].img;
                    const progress = 1 - ((seg.end - time) / transDur);
                    return { imgA: img, imgB: nextImg, progress };
                }
                return { imgA: img, imgB: null, progress: 0 };
            }
        }
        // Поза таймлайном — останній кадр
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
        const { timeline, totalDuration } = buildTimeline(images, settings);
        const trim = audioManager.getTrimRange();
        const audioClipDuration = trim.end - trim.start;

        previewCanvas.width = 480;
        previewCanvas.height = 270;
        const ctx = previewCanvas.getContext('2d');

        isPreviewing = true;
        cancelPreview = false;
        playPreviewBtn.style.display = 'none';
        stopPreviewBtn.style.display = 'inline-flex';
        previewStatus.textContent = '▶ Відтворення...';

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = true;
        source.loopStart = trim.start;
        source.loopEnd = trim.end;
        source.connect(audioCtx.destination);

        const startTime = audioCtx.currentTime;
        source.start(startTime, trim.start);

        const fps = 30;
        const frameDuration = 1 / fps;
        let animId = null;
        let lastFrameTime = performance.now();

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
            const frame = getFrameAtTime(elapsed, images, timeline, settings);
            renderTransition(ctx, frame.imgA, frame.imgB, frame.progress, settings);
            animId = requestAnimationFrame(loop);
        }
        animId = requestAnimationFrame(loop);

        source.onended = () => {};

        // Зберігаємо для зупинки
        previewState = { audioCtx, source, animId };
    }

    let previewState = null;

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
        const images = await photoManager.getLoadedImages();
        const audioBuffer = audioManager.getAudioBuffer();
        if (images.length === 0) { exportStatus.textContent = 'Додайте фото.'; return; }
        if (!audioBuffer) { exportStatus.textContent = 'Додайте музику.'; return; }

        const settings = getSettings();
        const mimeType = getSupportedMimeType(settings.format);
        if (!mimeType) {
            exportStatus.textContent = '❌ Ваш браузер не підтримує жодного формату відео.';
            return;
        }

        const { timeline, totalDuration } = buildTimeline(images, settings);
        const trim = audioManager.getTrimRange();
        const audioClipDuration = trim.end - trim.start;

        isExporting = true;
        cancelExport = false;
        exportBtn.disabled = true;
        stopExportBtn.style.display = 'inline-flex';
        exportProgress.style.display = 'block';
        downloadContainer.innerHTML = '';
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        exportStatus.textContent = 'Підготовка...';

        try {
            // Створюємо офлайн аудіо-буфер із зацикленням на потрібну тривалість
            const sampleRate = audioBuffer.sampleRate;
            const startSample = Math.floor(trim.start * sampleRate);
            const endSample = Math.floor(trim.end * sampleRate);
            const clipLength = endSample - startSample;
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

            exportStatus.textContent = 'Рендеринг аудіо...';
            const renderedBuffer = await offlineCtx.startRendering();

            if (cancelExport) throw new Error('Скасовано');

            // Створюємо canvas та потік
            const canvas = document.createElement('canvas');
            canvas.width = settings.width;
            canvas.height = settings.height;
            const ctx = canvas.getContext('2d');
            const stream = canvas.captureStream(settings.fps);

            // Додаємо аудіо-трек
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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

            // Рендеринг кадрів у реальному часі
            const startTime = performance.now();
            const fps = settings.fps;

            await new Promise(resolve => {
                function frame() {
                    if (cancelExport) { resolve(); return; }
                    const elapsed = (performance.now() - startTime) / 1000;
                    if (elapsed >= totalDuration) { resolve(); return; }

                    const f = getFrameAtTime(elapsed, images, timeline, settings);
                    renderTransition(ctx, f.imgA, f.imgB, f.progress, settings);

                    const pct = Math.min(100, (elapsed / totalDuration) * 100);
                    progressFill.style.width = pct + '%';
                    progressText.textContent = Math.round(pct) + '%';

                    setTimeout(frame, 1000 / fps);
                }
                frame();
            });

            recorder.stop();
            audioSource.stop();
            await recordingDone;

            try { audioCtx.close(); } catch (e) {}
            try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}

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
            console.error(err);
            exportStatus.textContent = '❌ Помилка: ' + err.message;
        } finally {
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

        if (ready) {
            exportStatus.textContent = '✅ Готово до експорту!';
            previewStatus.textContent = '✅ Готово до перегляду.';
        } else {
            if (!hasPhotos) exportStatus.textContent = 'Додайте хоча б одне фото.';
            else if (!hasAudio) exportStatus.textContent = 'Додайте музику.';
            else exportStatus.textContent = 'Виберіть фрагмент музики.';
        }
    }

    photoManager.setOnUpdate(checkReady);
    audioManager.setOnUpdate(checkReady);
    checkReady();

    return { checkReady };
}