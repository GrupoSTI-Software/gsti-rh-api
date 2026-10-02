import sharp from 'sharp'
import { faceDescriptorCache } from '#services/face_descriptor_cache_service'
import {
  PHOTO_MAX_BRIGHTNESS,
  PHOTO_MIN_BRIGHTNESS,
  PHOTO_MIN_FACE_AREA_RATIO,
  PHOTO_MIN_FACE_WIDTH_PX,
  PHOTO_VERDICT,
  type PhotoVerdict,
} from './photo.constants.js'

export interface PhotoQualityReport {
  verdict: PhotoVerdict
  faces: number
  faceAreaRatio: number | null
  /** Ancho de la cara en pixeles del original; `null` si no hubo una sola cara. */
  faceWidthPx: number | null
  brightness: number | null
}

export interface PhotoQualityOptions {
  /**
   * Pixeles de la imagen evaluada por cada pixel del original. El derivado se
   * amplia o reduce al tamaño del aparato, y la cara hay que medirla en lo que
   * de verdad se fotografio.
   */
  sourceScale?: number
}

/**
 * Decide si una foto sirve como referencia facial en un checador (spec 7.2).
 *
 * Se separa de la calidad que declaro el Backoffice al subirla: aquella medida
 * es de otra cosa y de otro momento. La puerta es este veredicto propio, sobre
 * el DERIVADO que de verdad se le va a mandar al aparato.
 *
 * Distingue dos fracasos que no se parecen en nada:
 *
 * - la foto no sirve (nadie, dos personas, muy oscura): el operador lo arregla
 *   con otra foto, y se le dice cual es el requisito.
 * - no se pudo evaluar (modelos ausentes, canvas, memoria): no es culpa de la
 *   foto y se responde 500, porque dar por rechazada una foto buena obligaria a
 *   volver a fotografiar a alguien sin motivo.
 */
export default class PhotoQualityService {
  constructor(
    private readonly detector: {
      detectAllFacesIn(buffer: Buffer): Promise<{
        faces: number
        boxes: Array<{ x: number; y: number; width: number; height: number }>
        width: number
        height: number
      }>
    } = faceDescriptorCache
  ) {}

  /** Lanza si no se pudo evaluar; devuelve el veredicto si si se pudo. */
  async evaluate(buffer: Buffer, options: PhotoQualityOptions = {}): Promise<PhotoQualityReport> {
    const sourceScale = options.sourceScale && options.sourceScale > 0 ? options.sourceScale : 1
    const detection = await this.detector.detectAllFacesIn(buffer)
    const stats = await sharp(buffer).stats()
    /** Media de los canales de color. `sharp` la da por canal. */
    const brightness =
      stats.channels.length > 0
        ? stats.channels.reduce((sum, channel) => sum + channel.mean, 0) / stats.channels.length
        : null

    if (detection.faces === 0) {
      return {
        verdict: PHOTO_VERDICT.NO_FACE,
        faces: 0,
        faceAreaRatio: null,
        faceWidthPx: null,
        brightness,
      }
    }
    if (detection.faces > 1) {
      return {
        verdict: PHOTO_VERDICT.MANY_FACES,
        faces: detection.faces,
        faceAreaRatio: null,
        faceWidthPx: null,
        brightness,
      }
    }

    const [box] = detection.boxes
    const frame = detection.width * detection.height
    const faceAreaRatio = frame > 0 ? (box.width * box.height) / frame : 0
    const faceWidthPx = Math.round(box.width / sourceScale)

    if (faceAreaRatio < PHOTO_MIN_FACE_AREA_RATIO || faceWidthPx < PHOTO_MIN_FACE_WIDTH_PX) {
      return {
        verdict: PHOTO_VERDICT.FACE_TOO_SMALL,
        faces: 1,
        faceAreaRatio,
        faceWidthPx,
        brightness,
      }
    }
    if (
      brightness === null ||
      brightness < PHOTO_MIN_BRIGHTNESS ||
      brightness > PHOTO_MAX_BRIGHTNESS
    ) {
      return { verdict: PHOTO_VERDICT.BRIGHTNESS, faces: 1, faceAreaRatio, faceWidthPx, brightness }
    }

    return { verdict: PHOTO_VERDICT.OK, faces: 1, faceAreaRatio, faceWidthPx, brightness }
  }
}
