import PhotoDerivativeService from '#modules/biometric-vault/photo/photo_derivative.service'

const originalBuildFromBuffer = PhotoDerivativeService.prototype.buildFromBuffer

/**
 * Da por buena cualquier foto en la admision del checador.
 *
 * Las pruebas de permisos suben un PNG de un pixel: lo que miden es quien puede
 * escribir, no si la foto sirve. Sin esto la regla del checador la rechaza con
 * 422 antes de que el permiso llegue a decidir nada.
 */
export function stubDeviceReadyPhoto(): void {
  PhotoDerivativeService.prototype.buildFromBuffer = async function () {
    const buffer = Buffer.from([0xff, 0xd8])
    return { ok: true, buffer, bytes: buffer.length, verdict: 'ok' }
  }
}

export function restoreDeviceReadyPhoto(): void {
  PhotoDerivativeService.prototype.buildFromBuffer = originalBuildFromBuffer
}
