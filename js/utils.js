export function generateId() {
    return Date.now() + '-' + Math.random().toString(36).substring(2, 9);
}

export function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0.0 с';
    return seconds.toFixed(1) + ' с';
}

export function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

export function decodeAudio(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const buffer = await audioCtx.decodeAudioData(arrayBuffer);
                audioCtx.close().catch(() => {});
                resolve(buffer);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsArrayBuffer(blob);
    });
}

export function isMediaRecorderSupported() {
    return typeof window.MediaRecorder !== 'undefined';
}

export function getSupportedMimeType(preferredFormat = 'auto') {
    if (!isMediaRecorderSupported()) return '';

    const candidates = preferredFormat === 'auto'
        ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        : preferredFormat === 'mp4'
            ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
            : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

    for (const mime of candidates) {
        try {
            if (MediaRecorder.isTypeSupported(mime)) return mime;
        } catch (e) { /* ignore */ }
    }
    return '';
}

export function getFileExtension(mimeType) {
    if (!mimeType) return 'webm';
    return mimeType.includes('mp4') ? 'mp4' : 'webm';
}

export function waitForEvent(target, event, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for ' + event)), timeout);
        target.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
    });
}