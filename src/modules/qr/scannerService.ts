import { BrowserMultiFormatReader } from '@zxing/browser';

export type ScannerEngine = 'barcode-detector' | 'zxing';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface ScanResult {
  value: string;
  format?: string;
  engine: ScannerEngine;
}

export interface ScannerController {
  engine: ScannerEngine;
  stop: () => void;
}

interface DetectedBarcode {
  rawValue: string;
  format?: string;
}

interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
}

const PREFERRED_FORMATS = ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e'];

function barcodeDetectorConstructor(): BarcodeDetectorConstructor | undefined {
  return (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
}

function cameraConstraints(deviceId?: string): MediaStreamConstraints {
  return {
    audio: false,
    video: deviceId
      ? { deviceId: { exact: deviceId } }
      : {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
  };
}

function stopVideo(video: HTMLVideoElement) {
  const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
  stream?.getTracks().forEach((track) => track.stop());
  video.pause();
  video.srcObject = null;
}

export function describeCameraError(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return error instanceof Error ? error.message : 'Không thể khởi động camera.';
  }

  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Trình duyệt đang chặn quyền camera. Hãy cho phép camera và bảo đảm trang chạy bằng HTTPS.';
    case 'NotFoundError':
      return 'Không tìm thấy camera trên thiết bị.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Camera đang bận hoặc không thể truy cập. Hãy đóng ứng dụng khác đang dùng camera rồi thử lại.';
    case 'OverconstrainedError':
      return 'Camera không đáp ứng cấu hình được yêu cầu. Hãy thử camera khác.';
    default:
      return `Không thể mở camera (${error.name}).`;
  }
}

export async function listCameras(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === 'videoinput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }));
}

async function supportedNativeFormats(ctor: BarcodeDetectorConstructor): Promise<string[]> {
  if (!ctor.getSupportedFormats) return PREFERRED_FORMATS;
  try {
    const supported = await ctor.getSupportedFormats();
    return PREFERRED_FORMATS.filter((format) => supported.includes(format));
  } catch {
    return PREFERRED_FORMATS;
  }
}

async function startNativeScanner(
  video: HTMLVideoElement,
  onResult: (result: ScanResult) => void,
  deviceId?: string,
): Promise<ScannerController | null> {
  const ctor = barcodeDetectorConstructor();
  if (!ctor || !navigator.mediaDevices?.getUserMedia) return null;

  const formats = await supportedNativeFormats(ctor);
  if (formats.length === 0) return null;

  let detector: BarcodeDetectorInstance;
  try {
    detector = new ctor({ formats });
  } catch {
    return null;
  }

  const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId));
  video.srcObject = stream;
  await video.play();

  let stopped = false;
  let busy = false;
  const timer = window.setInterval(async () => {
    if (stopped || busy || document.hidden || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    busy = true;
    try {
      const codes = await detector.detect(video);
      for (const code of codes) {
        const value = code.rawValue?.trim();
        if (value) onResult({ value, format: code.format, engine: 'barcode-detector' });
      }
    } catch {
      // Decode failures are expected while the camera is moving; keep scanning.
    } finally {
      busy = false;
    }
  }, 240);

  return {
    engine: 'barcode-detector',
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(timer);
      stopVideo(video);
    },
  };
}

async function startZxingScanner(
  video: HTMLVideoElement,
  onResult: (result: ScanResult) => void,
  deviceId?: string,
): Promise<ScannerController> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Trình duyệt này không hỗ trợ Web Camera API.');
  }

  const reader = new BrowserMultiFormatReader();
  const controls = await reader.decodeFromConstraints(cameraConstraints(deviceId), video, (result) => {
    if (!result) return;
    const value = result.getText().trim();
    if (!value) return;
    onResult({
      value,
      format: String(result.getBarcodeFormat()),
      engine: 'zxing',
    });
  });

  let stopped = false;
  return {
    engine: 'zxing',
    stop: () => {
      if (stopped) return;
      stopped = true;
      controls.stop();
      stopVideo(video);
    },
  };
}

export async function startCameraScanner(
  video: HTMLVideoElement,
  onResult: (result: ScanResult) => void,
  deviceId?: string,
): Promise<ScannerController> {
  if (!window.isSecureContext && window.location.hostname !== 'localhost') {
    throw new Error('Camera trên website công khai cần HTTPS (secure context).');
  }

  try {
    const nativeController = await startNativeScanner(video, onResult, deviceId);
    if (nativeController) return nativeController;
    return await startZxingScanner(video, onResult, deviceId);
  } catch (error) {
    stopVideo(video);
    throw new Error(describeCameraError(error));
  }
}
