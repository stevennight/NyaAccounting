import {
  ImageManipulator,
  SaveFormat,
} from 'expo-image-manipulator';
import { File as ExpoFile } from 'expo-file-system';

export const DEFAULT_SCREENSHOT_MAX_WIDTH = 1600;
export const DEFAULT_SCREENSHOT_QUALITY = 0.84;
export const MAX_AUDIO_UPLOAD_BYTES = 25 * 1024 * 1024;

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  'm4a',
  'mp3',
  'mp4',
  'mpeg',
  'mpga',
  'wav',
  'webm',
]);

const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
  wav: 'audio/wav',
  webm: 'audio/webm',
};

const AUDIO_EXTENSION_BY_MIME: Record<string, string> = {
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
};

export interface ScreenshotPreparationOptions {
  maxWidth?: number;
  quality?: number;
}

export interface PreparedScreenshot {
  uri: string;
  mimeType: 'image/jpeg';
  base64: string;
  dataUrl: string;
  width: number;
  height: number;
  approximateBytes: number;
}

export interface AudioSource {
  uri: string;
  fileName?: string;
  mimeType?: string;
}

export interface NormalizedAudioSource {
  uri: string;
  fileName: string;
  mimeType: string;
  extension: string;
}

export class MediaPreparationError extends Error {
  readonly code:
    | 'invalid_input'
    | 'image_processing_failed'
    | 'unsupported_audio'
    | 'audio_too_large'
    | 'audio_unreadable';

  constructor(
    code: MediaPreparationError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'MediaPreparationError';
    this.code = code;
  }
}

function clampQuality(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new MediaPreparationError(
      'invalid_input',
      'Screenshot quality must be greater than 0 and no more than 1.',
    );
  }
  return value;
}

function validateMaxWidth(value: number): number {
  if (!Number.isInteger(value) || value < 320 || value > 4096) {
    throw new MediaPreparationError(
      'invalid_input',
      'Screenshot width must be an integer between 320 and 4096 pixels.',
    );
  }
  return value;
}

function approximateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==')
    ? 2
    : base64.endsWith('=')
      ? 1
      : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function deleteFileBestEffort(uri: string): void {
  try {
    const file = new ExpoFile(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // A media preparation error should remain the primary failure.
  }
}

export async function prepareScreenshot(
  uri: string,
  options: ScreenshotPreparationOptions = {},
): Promise<PreparedScreenshot> {
  if (!uri.trim()) {
    throw new MediaPreparationError(
      'invalid_input',
      'Choose a screenshot before starting recognition.',
    );
  }

  const maxWidth = validateMaxWidth(
    options.maxWidth ?? DEFAULT_SCREENSHOT_MAX_WIDTH,
  );
  const quality = clampQuality(
    options.quality ?? DEFAULT_SCREENSHOT_QUALITY,
  );

  try {
    const context = ImageManipulator.manipulate(uri);
    const original = await context.renderAsync();

    if (original.width > maxWidth) {
      context.resize({ width: maxWidth });
    }

    const rendered =
      original.width > maxWidth
        ? await context.renderAsync()
        : original;
    const saved = await rendered.saveAsync({
      base64: true,
      compress: quality,
      format: SaveFormat.JPEG,
    });

    if (!saved.base64) {
      deleteFileBestEffort(saved.uri);
      throw new MediaPreparationError(
        'image_processing_failed',
        'The compressed screenshot did not contain image data.',
      );
    }

    return {
      uri: saved.uri,
      mimeType: 'image/jpeg',
      base64: saved.base64,
      dataUrl: `data:image/jpeg;base64,${saved.base64}`,
      width: saved.width,
      height: saved.height,
      approximateBytes: approximateBase64Bytes(saved.base64),
    };
  } catch (error) {
    if (error instanceof MediaPreparationError) {
      throw error;
    }

    throw new MediaPreparationError(
      'image_processing_failed',
      'The screenshot could not be resized and compressed.',
    );
  }
}

function lastPathSegment(uri: string): string {
  const withoutQuery = uri.split(/[?#]/, 1)[0];
  const segments = withoutQuery.split('/');
  const candidate = segments[segments.length - 1];

  try {
    return decodeURIComponent(candidate || '');
  } catch {
    return candidate || '';
  }
}

function cleanFileName(value: string): string {
  return value
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 120);
}

function extensionOf(fileName: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  return match?.[1]?.toLowerCase() ?? '';
}

export function normalizeAudioSource(
  source: AudioSource,
): NormalizedAudioSource {
  if (!source.uri.trim()) {
    throw new MediaPreparationError(
      'invalid_input',
      'Choose or record audio before transcribing it.',
    );
  }

  const suppliedMime = source.mimeType?.trim().toLowerCase() ?? '';
  const suppliedName = cleanFileName(
    source.fileName?.trim() || lastPathSegment(source.uri),
  );
  const suppliedExtension = extensionOf(suppliedName);
  const extension =
    (SUPPORTED_AUDIO_EXTENSIONS.has(suppliedExtension)
      ? suppliedExtension
      : AUDIO_EXTENSION_BY_MIME[suppliedMime]) ?? '';

  if (!extension || !SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
    throw new MediaPreparationError(
      'unsupported_audio',
      'Use an MP3, MP4, MPEG, MPGA, M4A, WAV, or WebM audio file.',
    );
  }

  const fileName =
    suppliedName && extensionOf(suppliedName) === extension
      ? suppliedName
      : `voice-note.${extension}`;

  return {
    uri: source.uri,
    fileName,
    extension,
    mimeType: AUDIO_MIME_BY_EXTENSION[extension] || 'audio/mpeg',
  };
}

export function assertAudioSize(sizeBytes: number): void {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new MediaPreparationError(
      'audio_unreadable',
      'The audio file size could not be determined.',
    );
  }

  if (sizeBytes > MAX_AUDIO_UPLOAD_BYTES) {
    throw new MediaPreparationError(
      'audio_too_large',
      'The audio recording is larger than the 25 MB transcription limit.',
    );
  }
}
