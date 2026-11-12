export function generateId() {
    return Date.now() + '-' + Math.random().toString(36).substring(2, 9);
}

export function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0.0 с';
    return seconds.toFixed(1) + ' с';
}

export function decodeAudio(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const buffer = await audioCtx.decodeAudioData(arrayBuffer);
                resolve(buffer);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
    });
}

export function getSupportedMimeType(preferredFormat = 'auto') {
    const candidates = preferredFormat === 'auto'
        ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        : preferredFormat === 'mp4'
            ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
            : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

    for (const mime of candidates) {
        if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return '';
}

export function getFileExtension(mimeType) {
    return mimeType.includes('mp4') ? 'mp4' : 'webm';
}