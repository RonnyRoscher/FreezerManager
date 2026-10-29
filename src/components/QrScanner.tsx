import { useEffect, useRef } from 'react';
import QrScannerLib from 'qr-scanner';

type Props = { onResult: (text: string) => void; onError: (e: Error) => void };

/** Continuously scans QR codes with the rear camera. */
export function QrScanner({ onResult, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onResult, onError });
  callbacks.current = { onResult, onError };

  useEffect(() => {
    const scanner = new QrScannerLib(videoRef.current!, (result) => callbacks.current.onResult(result.data), {
      preferredCamera: 'environment',
      highlightScanRegion: true,
      returnDetailedScanResult: true,
    });
    scanner.start().catch((e: unknown) => callbacks.current.onError(e instanceof Error ? e : new Error(String(e))));
    return () => {
      scanner.stop();
      scanner.destroy();
    };
  }, []);

  return <video ref={videoRef} className="scanner-video" muted playsInline />;
}
