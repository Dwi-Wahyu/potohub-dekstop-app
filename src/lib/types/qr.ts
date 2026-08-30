export interface QrPoint {
  x: number;
  y: number;
}

export interface QrScanResult {
  content: string;
  cornerPoints: QrPoint[];
}

export type QrScanStatus = 'idle' | 'detecting' | 'verifying' | 'success' | 'error';
