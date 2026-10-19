/**
 * The scanner engine, kept behind a dynamic import (BC-13 / NP-11).
 *
 * `html5-qrcode` plus the ZXing decoder is the single largest script in the
 * portal. It must never be pulled into the scanner page's shared/entry chunk:
 * an officer on a low-end Android in a gym needs the event picker and the
 * manual number search to work before — and even if — the camera bundle
 * arrives. Only the formatted enum and the camera class are imported here, and
 * only when `startStudentScanner()` is called on mount.
 *
 * The type-only import of `Html5Qrcode` is erased at build time; it does not
 * create a static dependency edge.
 */
import type { Html5Qrcode } from 'html5-qrcode'

export interface ScannerHandle {
  stop: () => Promise<void>
}

export async function startStudentScanner(
  elementId: string,
  onDecoded: (text: string) => void
): Promise<ScannerHandle> {
  const { Html5Qrcode: Scanner, Html5QrcodeSupportedFormats } = await import('html5-qrcode')

  // D-03: iOS officers do QR-only duty. Reading 1D barcodes on iOS Safari leans
  // on a polyfill we cannot verify from here, so the supported split is QR
  // everywhere and ID barcodes on Chromium — with the number search as the
  // fallback on any phone.
  const isAppleMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
  const formats = [
    Html5QrcodeSupportedFormats.QR_CODE,
    ...(isAppleMobile
      ? []
      : [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E
        ])
  ]

  const scanner: Html5Qrcode = new Scanner(elementId, {
    verbose: false,
    formatsToSupport: formats
  })

  await scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText: string) => onDecoded(decodedText),
    () => {} // per-frame decode misses are normal; ignore them
  )

  return {
    stop: async () => {
      await scanner.stop().catch(() => {})
      scanner.clear()
    }
  }
}
