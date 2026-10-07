/**
 * EMVCo QRIS (Quick Response Code Indonesian Standard) Dynamic Payload Builder
 * 
 * Digunakan untuk menghasilkan raw string QRIS Merchant-Presented Mode (MPM)
 * standar Bank Indonesia & ASPI yang valid dibaca oleh scanner QRIS, perbankan,
 * dan QRIS Simulator DOKU (https://sandbox.doku.com/qris-simulator).
 */

function formatTlv(tag: string, val: string): string {
  const len = val.length.toString().padStart(2, '0');
  return `${tag}${len}${val}`;
}

function crc16Ccitt(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface QrisPayloadOptions {
  amount: number;
  orderId: string;
  merchantName?: string;
  city?: string;
  postalCode?: string;
  dokuAcquirerId?: string;
  dokuMerchantId?: string;
  terminalId?: string;
}

export function buildDynamicQrisString(options: QrisPayloadOptions): string {
  const {
    amount,
    orderId,
    merchantName = 'POTOHUB PHOTOBOOTH',
    city = 'JAKARTA',
    postalCode = '12345',
    dokuAcquirerId = '936008990000013735',
    dokuMerchantId = '13735',
    terminalId = 'A01',
  } = options;

  const amtStr = Number(amount || 0).toFixed(2);

  // Sub-tag 26: DOKU QR MPM Identifier
  const m26 =
    formatTlv('00', 'COM.DOKU.WWW') +
    formatTlv('01', dokuAcquirerId) +
    formatTlv('02', dokuMerchantId) +
    formatTlv('03', 'UKE');

  // Sub-tag 51: National QRIS Identifier (ASPI)
  const m51 =
    formatTlv('00', 'ID.CO.QRIS.WWW') +
    formatTlv('02', 'ID2025072859992') +
    formatTlv('03', 'UKE');

  // Sub-tag 62: Additional Data Field (Terminal ID + Invoice Reference)
  const cleanOrderId = (orderId || 'ORDER').slice(0, 25);
  const m62 = formatTlv('07', terminalId) + formatTlv('50', cleanOrderId);

  const cleanName = (merchantName || 'POTOHUB').slice(0, 25);
  const cleanCity = (city || 'JAKARTA').slice(0, 15);
  const cleanPostal = (postalCode || '12345').slice(0, 10);

  const body =
    formatTlv('00', '01') + // Payload Format Indicator
    formatTlv('01', '12') + // Point of Initiation Method: 12 (Dynamic QRIS)
    formatTlv('26', m26) + // Merchant Account Info (DOKU)
    formatTlv('51', m51) + // Merchant Account Info (National QRIS)
    formatTlv('52', '5661') + // Merchant Category Code (Photography/Photobooth)
    formatTlv('53', '360') + // Transaction Currency: 360 (IDR)
    formatTlv('54', amtStr) + // Transaction Amount
    formatTlv('58', 'ID') + // Country Code: ID
    formatTlv('59', cleanName) + // Merchant Name
    formatTlv('60', cleanCity) + // Merchant City
    formatTlv('61', cleanPostal) + // Postal Code
    formatTlv('62', m62) + // Additional Data Field
    '6304'; // CRC Tag (63) & Length (04)

  const crc = crc16Ccitt(body);
  return `${body}${crc}`;
}
