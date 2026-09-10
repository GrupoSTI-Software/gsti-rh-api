import sharp from 'sharp'
import { BIOMETRIC_VAULT_ERROR_CODES } from '#constants/biometric_vault_error_codes'
import { BiometricVaultError } from '#exceptions/biometric_vault_error'
import UploadService from '#services/upload_service'
import PhotoQualityService from './photo_quality.service.js'
import {
  JPEG_MAGIC,
  PHOTO_DERIVATIVE_HEIGHT,
  PHOTO_DERIVATIVE_MAX_BYTES,
  PHOTO_DERIVATIVE_MIN_BYTES,
  PHOTO_DERIVATIVE_QUALITY,
  PHOTO_DERIVATIVE_WIDTH,
  PHOTO_SOURCE_MIN_HEIGHT,
  PHOTO_SOURCE_MIN_WIDTH,
  PHOTO_VERDICT,
  derivativeKeyFor,
  type PhotoVerdict,
} from './photo.constants.js'

export type DerivativeOutcome =
  | { ok: true; buffer: Buffer; bytes: number; verdict: 'ok' }
  | { ok: false; verdict: PhotoVerdict; detail: string }

/**
 * Fabrica la imagen que se le manda al checador (spec ADMS 7.2).
 *
 * NO es la foto del expediente: es una imagen nueva, recortada al encuadre que
 * el aparato acepta y guardada aparte. El original no se toca ni cambia de
 * permisos; asi, apagar el uso en dispositivos borra el derivado y no deja
 * rastro de la foto en un formato pensado para maquinas.
 *
 * El recorte usa `position: 'attention'`, que centra en la zona con mas detalle
 * -- en una foto de credencial, la cara. Un recorte al centro geometrico le
 * cortaria la frente a media plantilla.
 */
export default class PhotoDerivativeService {
  constructor(
    private readonly quality: PhotoQualityService = new PhotoQualityService(),
    private readonly uploads: UploadService = new UploadService()
  ) {}

  /**
   * Descarga el original, lo normaliza y lo evalua. No sube nada: quien llama
   * decide si publicar, porque el mismo derivado sirve para varios equipos.
   */
  async build(sourceKey: string): Promise<DerivativeOutcome> {
    const original = await this.readOriginal(sourceKey)
    const meta = await sharp(original).metadata()

    /**
     * El minimo es del ORIGINAL, no del resultado: `sharp` amplia lo que le
     * den y devolveria 640 x 800 borrosos que el aparato aceptaria y con los
     * que despues no reconoceria a nadie.
     */
    if ((meta.width ?? 0) < PHOTO_SOURCE_MIN_WIDTH || (meta.height ?? 0) < PHOTO_SOURCE_MIN_HEIGHT) {
      return {
        ok: false,
        verdict: PHOTO_VERDICT.RESOLUTION,
        detail: `La foto original debe medir al menos ${PHOTO_SOURCE_MIN_WIDTH} por ${PHOTO_SOURCE_MIN_HEIGHT} pixeles.`,
      }
    }

    const buffer = await sharp(original)
      // `rotate()` sin argumentos aplica la orientacion EXIF: sin esto, una
      // foto tomada de lado llega al equipo acostada.
      .rotate()
      .resize(PHOTO_DERIVATIVE_WIDTH, PHOTO_DERIVATIVE_HEIGHT, {
        fit: 'cover',
        position: 'attention',
      })
      .jpeg({ quality: PHOTO_DERIVATIVE_QUALITY, progressive: false })
      .toBuffer()

    if (!buffer.subarray(0, 2).equals(JPEG_MAGIC)) {
      return {
        ok: false,
        verdict: PHOTO_VERDICT.DERIVATIVE_SIZE,
        detail: 'El resultado no es un JPEG valido.',
      }
    }
    if (buffer.length < PHOTO_DERIVATIVE_MIN_BYTES || buffer.length > PHOTO_DERIVATIVE_MAX_BYTES) {
      return {
        ok: false,
        verdict: PHOTO_VERDICT.DERIVATIVE_SIZE,
        detail: `La imagen resultante pesa ${buffer.length} bytes y el equipo acepta entre ${PHOTO_DERIVATIVE_MIN_BYTES} y ${PHOTO_DERIVATIVE_MAX_BYTES}.`,
      }
    }

    const report = await this.quality.evaluate(buffer)
    if (report.verdict !== PHOTO_VERDICT.OK) {
      return { ok: false, verdict: report.verdict, detail: explain(report.verdict) }
    }

    return { ok: true, buffer, bytes: buffer.length, verdict: PHOTO_VERDICT.OK }
  }

  /**
   * Guarda el derivado en el bucket privado y devuelve la llave REAL que
   * respondio el almacenamiento: lleva el prefijo de la aplicacion y no
   * coincide con la que se pidio.
   */
  async store(employeeId: number, version: number, buffer: Buffer): Promise<string> {
    const key = await this.uploads.uploadPrivateBuffer(
      derivativeKeyFor(employeeId, version),
      buffer,
      'image/jpeg'
    )
    if (!key) {
      /**
       * Sin llave no hay derivado. Seguir dejaria el interruptor encendido y
       * una publicacion apuntando a un objeto que no existe: el equipo pediria
       * la foto, recibiria 404 y el comando fallaria sin motivo visible.
       */
      throw new BiometricVaultError(
        'No se pudo guardar la foto normalizada',
        BIOMETRIC_VAULT_ERROR_CODES.PHOTO_STORAGE,
        500,
        'derivado-no-guardado',
        'El almacenamiento no acepto la imagen. Intenta de nuevo o avisa a soporte.'
      )
    }
    return key
  }

  private async readOriginal(sourceKey: string): Promise<Buffer> {
    const object = await this.uploads.getObjectStream(sourceKey)
    if (!object) {
      throw new BiometricVaultError(
        'No se encontro la foto biometrica del colaborador',
        BIOMETRIC_VAULT_ERROR_CODES.PHOTO_MISSING,
        422,
        'foto-no-encontrada',
        'El colaborador no tiene una foto biometrica cargada.'
      )
    }
    const chunks: Buffer[] = []
    for await (const chunk of object.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }
}

/** Requisito legible del rechazo, para que el operador sepa que cambiar. */
function explain(verdict: PhotoVerdict): string {
  switch (verdict) {
    case PHOTO_VERDICT.NO_FACE:
      return 'No se detecto ningun rostro en la foto.'
    case PHOTO_VERDICT.MANY_FACES:
      return 'Se detecto mas de un rostro; la foto debe ser solo del colaborador.'
    case PHOTO_VERDICT.FACE_TOO_SMALL:
      return 'El rostro ocupa muy poco de la imagen; hace falta un acercamiento.'
    case PHOTO_VERDICT.BRIGHTNESS:
      return 'La foto esta demasiado oscura o demasiado clara.'
    default:
      return 'La foto no cumple los requisitos para usarse en un checador.'
  }
}
