/** Camera access with clear, human-readable errors. */

export type CameraErrorKind =
  'denied' | 'notfound' | 'inuse' | 'insecure' | 'unsupported' | 'unknown';

export class CameraError extends Error {
  constructor(
    public readonly kind: CameraErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

export interface CameraOptions {
  deviceId?: string;
  width?: number;
  height?: number;
}

export async function openCamera(opts: CameraOptions = {}): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new CameraError(
      'insecure',
      'The camera only works on a secure page. Open SignScan over https:// or from localhost.',
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(
      'unsupported',
      'This browser cannot use the camera. Try a recent Chrome, Edge, Firefox or Safari.',
    );
  }
  const video: MediaTrackConstraints = {
    width: { ideal: opts.width ?? 640 },
    height: { ideal: opts.height ?? 480 },
    frameRate: { ideal: 30 },
  };
  if (opts.deviceId) video.deviceId = { exact: opts.deviceId };
  else video.facingMode = 'user';
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (err) {
    throw toCameraError(err);
  }
}

export function toCameraError(err: unknown): CameraError {
  if (err instanceof CameraError) return err;
  const name = (err as { name?: string })?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError(
        'denied',
        'Camera permission was denied. Allow camera access for this site in your browser settings, then try again.',
      );
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new CameraError(
        'notfound',
        'No camera was found. Connect a webcam, or pick a different camera in Settings.',
      );
    case 'NotReadableError':
    case 'AbortError':
      return new CameraError(
        'inuse',
        'The camera is busy. Close other apps or tabs that are using it (video calls, other camera apps), then try again.',
      );
    default:
      return new CameraError('unknown', `Could not start the camera (${name || String(err)}).`);
  }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}
