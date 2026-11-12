import { generateId, escapeHtml } from './utils.js';

export function createPhotoManager() {
    let photos = []; // { id, file, url, duration }
    let onUpdate = () => {};

    const photoList = document.getElementById('photoList');
    const previewArea = document.getElementById('previewArea');
    const photoInput = document.getElementById('photoInput');
    const clearPhotosBtn = document.getElementById('clearPhotosBtn');

    if (!photoList || !previewArea || !photoInput || !clearPhotosBtn) {
        console.error('[photoManager] Не знайдено DOM-елементи');
        return createStub();
    }

    function createStub() {
        return {
            getPhotos: () => [],
            getLoadedImages: async () => [],
            addPhotos: () => {},
            removePhoto: () => {},
            clearAll: () => {},
            setOnUpdate: () => {},
            hasPhotos: () => false,
            getTotalDuration: () => 0,
        };
    }

    function setOnUpdate(cb) {
        onUpdate = typeof cb === 'function' ? cb : () => {};
        onUpdate();
    }

    function notify() {
        try { onUpdate(); } catch (e) { console.error('[photoManager] onUpdate error:', e); }
    }

    function addPhotos(files) {
        if (!files || files.length === 0) return;
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) {
            console.warn('[photoManager] Немає зображень у виборі');
            return;
        }
        imageFiles.forEach(file => {
            const url = URL.createObjectURL(file);
            photos.push({ id: generateId(), file, url, duration: 3 });
        });
        render();
        updatePreview();
        notify();
        console.log(`[photoManager] Додано ${imageFiles.length}, всього ${photos.length}`);
    }

    function removePhoto(id) {
        const idx = photos.findIndex(p => p.id === id);
        if (idx === -1) return;
        URL.revokeObjectURL(photos[idx].url);
        photos.splice(idx, 1);
        render();
        updatePreview();
        notify();
    }

    function clearAll() {
        photos.forEach(p => URL.revokeObjectURL(p.url));
        photos = [];
        render();
        updatePreview();
        notify();
    }

    function updateDuration(id, value) {
        const photo = photos.find(p => p.id === id);
        if (!photo) return;
        let dur = parseFloat(value);
        if (isNaN(dur) || dur < 0.5) dur = 0.5;
        if (dur > 30) dur = 30;
        photo.duration = dur;
        notify();
    }

    function movePhoto(id, direction) {
        const idx = photos.findIndex(p => p.id === id);
        if (idx === -1) return;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= photos.length) return;
        [photos[idx], photos[newIdx]] = [photos[newIdx], photos[idx]];
        render();
        updatePreview();
        notify();
    }

    function render() {
        if (photos.length === 0) {
            photoList.innerHTML = `<div style="color:#5e647d; font-size:0.9rem; padding:12px;">Ще немає фото. Додайте перше!</div>`;
            return;
        }
        photoList.innerHTML = photos.map((photo, index) => `
            <div class="photo-item" data-id="${photo.id}">
                <img class="photo-thumb" src="${photo.url}" alt="thumb">
                <span class="photo-name">${escapeHtml(photo.file.name) || 'фото ' + (index + 1)}</span>
                <div class="photo-duration">
                    <span>⏱️</span>
                    <input type="number" class="duration-input" data-id="${photo.id}" min="0.5" max="30" step="0.5" value="${photo.duration}">
                    <span>с</span>
                </div>
                <button class="icon-btn" data-move="up" data-id="${photo.id}" title="Вгору">▲</button>
                <button class="icon-btn" data-move="down" data-id="${photo.id}" title="Вниз">▼</button>
                <button class="icon-btn danger" data-remove="${photo.id}" title="Видалити">✕</button>
            </div>
        `).join('');

        photoList.querySelectorAll('.duration-input').forEach(input => {
            input.addEventListener('change', e => updateDuration(e.target.dataset.id, e.target.value));
        });
        photoList.querySelectorAll('[data-remove]').forEach(btn => {
            btn.addEventListener('click', e => removePhoto(e.currentTarget.dataset.remove));
        });
        photoList.querySelectorAll('[data-move]').forEach(btn => {
            btn.addEventListener('click', e => {
                const dir = e.currentTarget.dataset.move === 'up' ? -1 : 1;
                movePhoto(e.currentTarget.dataset.id, dir);
            });
        });
    }

    function updatePreview() {
        if (photos.length === 0) {
            previewArea.innerHTML = `<div class="preview-placeholder">Додайте фото, щоб побачити прев'ю</div>`;
            return;
        }
        previewArea.innerHTML = `<img src="${photos[0].url}" alt="preview">`;
    }

    async function getLoadedImages() {
        const results = [];
        for (const photo of photos) {
            try {
                const img = await new Promise((resolve, reject) => {
                    const image = new Image();
                    image.onload = () => resolve(image);
                    image.onerror = () => reject(new Error('Не вдалось завантажити ' + photo.file.name));
                    image.src = photo.url;
                });
                results.push({ img, duration: photo.duration });
            } catch (err) {
                console.warn(err);
            }
        }
        return results;
    }

    photoInput.addEventListener('change', e => {
        console.log('[photoManager] change event, files:', e.target.files ? e.target.files.length : 0);
        if (e.target.files) addPhotos(e.target.files);
        e.target.value = '';
    });

    clearPhotosBtn.addEventListener('click', clearAll);

    render();
    updatePreview();

    return {
        getPhotos: () => photos,
        getLoadedImages,
        addPhotos,
        removePhoto,
        clearAll,
        setOnUpdate,
        hasPhotos: () => photos.length > 0,
        getTotalDuration: () => photos.reduce((s, p) => s + p.duration, 0),
    };
}