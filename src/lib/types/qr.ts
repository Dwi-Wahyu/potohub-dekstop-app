export interface QrPoint {
  x: number;
  y: number;
}

export interface QrScanResult {
  content: string;
  cornerPoints: QrPoint[];
  sourceWidth?: number;
  sourceHeight?: number;
}

export type QrScanStatus = 'idle' | 'detecting' | 'verifying' | 'success' | 'error';
