import { createPhotoManager } from './photoManager.js';
import { createAudioManager } from './audioManager.js';
import { createExporter } from './exporter.js';

const photoManager = createPhotoManager();
const audioManager = createAudioManager();
const exporter = createExporter(photoManager, audioManager);