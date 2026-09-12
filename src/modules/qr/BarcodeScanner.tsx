import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listCameras,
  startCameraScanner,
  type CameraDevice,
  type ScanResult,
  type ScannerController,
} from './scannerService';
import { createDuplicateSuppressor } from './productLookup';

interface BarcodeScannerProps {
  onScan: (result: ScanResult) => void;
  duplicateWindowMs?: number;
}

export default function BarcodeScanner({ onScan, duplicateWindowMs = 1400 }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controllerRef = useRef<ScannerController | null>(null);
  const desiredActiveRef = useRef(false);
  const startTokenRef = useRef(0);
  const onScanRef = useRef(onScan);
  const suppressor = useMemo(() => createDuplicateSuppressor(duplicateWindowMs), [duplicateWindowMs]);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('Camera đang tắt.');
  const [error, setError] = useState('');
  const [engine, setEngine] = useState('');
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stop = useCallback((keepDesiredState = false) => {
    startTokenRef.current += 1;
    controllerRef.current?.stop();
    controllerRef.current = null;
    if (!keepDesiredState) desiredActiveRef.current = false;
    setActive(false);
    setEngine('');
    setStatus(keepDesiredState ? 'Tạm dừng camera khi tab không hoạt động.' : 'Camera đang tắt.');
  }, []);

  const start = useCallback(
    async (deviceId = selectedCameraId) => {
      const video = videoRef.current;
      if (!video) return;

      const token = ++startTokenRef.current;
      desiredActiveRef.current = true;
      controllerRef.current?.stop();
      controllerRef.current = null;
      setError('');
      setStatus('Đang mở camera…');

      try {
        const controller = await startCameraScanner(
          video,
          (result) => {
            if (!suppressor.shouldAccept(result.value)) return;
            onScanRef.current(result);
          },
          deviceId || undefined,
        );

        if (token !== startTokenRef.current || !desiredActiveRef.current) {
          controller.stop();
          return;
        }

        controllerRef.current = controller;
        setActive(true);
        setEngine(controller.engine === 'barcode-detector' ? 'BarcodeDetector' : 'ZXing fallback');
        setStatus('Đang quét liên tục. Đưa QR hoặc mã vạch vào khung hình.');

        const available = await listCameras();
        if (token !== startTokenRef.current) return;
        setCameras(available);
        const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
        const currentDeviceId = stream?.getVideoTracks()[0]?.getSettings().deviceId;
        if (currentDeviceId) setSelectedCameraId(currentDeviceId);
      } catch (reason) {
        if (token !== startTokenRef.current) return;
        desiredActiveRef.current = false;
        setActive(false);
        setEngine('');
        setStatus('Không thể khởi động camera.');
        setError(reason instanceof Error ? reason.message : 'Không thể khởi động camera.');
      }
    },
    [selectedCameraId, suppressor],
  );

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (desiredActiveRef.current) stop(true);
      } else if (desiredActiveRef.current) {
        void start(selectedCameraId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      desiredActiveRef.current = false;
      startTokenRef.current += 1;
      controllerRef.current?.stop();
      controllerRef.current = null;
    };
  }, [selectedCameraId, start, stop]);

  const switchCamera = async () => {
    const available = cameras.length > 1 ? cameras : await listCameras();
    setCameras(available);
    if (available.length < 2) {
      setError('Thiết bị chỉ phát hiện một camera.');
      return;
    }
    const index = Math.max(0, available.findIndex((camera) => camera.deviceId === selectedCameraId));
    const next = available[(index + 1) % available.length];
    setSelectedCameraId(next.deviceId);
    suppressor.reset();
    if (desiredActiveRef.current) await start(next.deviceId);
  };

  return (
    <section className="qr-scanner" aria-labelledby="camera-scanner-heading">
      <div className="qr-section-heading">
        <div>
          <p className="eyebrow">Camera scanner</p>
          <h2 id="camera-scanner-heading">Quét QR / barcode</h2>
        </div>
        {engine ? <span className="qr-engine-badge">{engine}</span> : null}
      </div>

      <div className="qr-video-shell">
        <video ref={videoRef} className="qr-video" muted playsInline aria-label="Hình ảnh camera dùng để quét mã" />
        {!active ? <div className="qr-video-placeholder">Camera chưa bật</div> : null}
      </div>

      <p className="qr-status" role="status">{status}</p>
      {error ? <p className="qr-error" role="alert">{error}</p> : null}

      <div className="qr-scanner-actions">
        {active ? (
          <button className="button button--secondary qr-touch-button" type="button" onClick={() => stop()}>
            Tắt camera
          </button>
        ) : (
          <button className="button button--primary qr-touch-button" type="button" onClick={() => void start()}>
            Bật camera
          </button>
        )}
        <button className="button button--secondary qr-touch-button" type="button" onClick={() => void switchCamera()}>
          Đổi camera trước / sau
        </button>
      </div>

      {cameras.length > 1 ? (
        <label className="qr-field">
          Camera
          <select
            value={selectedCameraId}
            onChange={(event) => {
              const nextId = event.target.value;
              setSelectedCameraId(nextId);
              if (desiredActiveRef.current) void start(nextId);
            }}
          >
            {cameras.map((camera) => (
              <option key={camera.deviceId} value={camera.deviceId}>{camera.label}</option>
            ))}
          </select>
        </label>
      ) : null}
    </section>
  );
}
