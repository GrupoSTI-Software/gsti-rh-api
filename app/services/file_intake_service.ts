import fs from 'node:fs/promises'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import nodeId3 from 'node-id3'
// file-type@16 es CommonJS (module.exports = {...}); Node no expone sus
// miembros como named exports en ESM. Se importa el default y se accede a
// fromBuffer por propiedad.
import fileType from 'file-type'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import {
  FILE_INTAKE_AUDIO_MIMES,
  FILE_INTAKE_IMAGE_MIMES,
  FILE_INTAKE_JPEG_QUALITY,
  FILE_INTAKE_MP3_MIMES,
  FILE_INTAKE_PDF_MIMES,
  FILE_INTAKE_PROFILES,
  FILE_INTAKE_SPREADSHEET_MIMES,
  type FileIntakeMime,
  type FileIntakeProfile,
  type FileIntakeProfileName,
} from '#constants/file_intake'
import { FILE_INTAKE_ERROR_CODES } from '#constants/file_intake_error_codes'
import { FileIntakeError } from '#exceptions/file_intake_error'
import { buildStorageFileName, rejectClientFileName } from '#helpers/file_intake_file_name'

/** Archivo aceptado: contenido ya transformado y listo para persistir. */
export interface FileIntakeResult {
  /** Contenido transformado. Nunca es el buffer original tal cual, salvo audio AAC y XLSX. */
  readonly buffer: Buffer
  /** MIME real de SALIDA. Es el que debe viajar como `ContentType` al bucket. */
  readonly mimeType: FileIntakeMime
  readonly fileSize: number
  /** Nombre no predecible con la extensión del MIME de salida. */
  readonly storageFileName: string
  /** Copiado del perfil: quien persiste decide la ACL con esto, no por su cuenta. */
  readonly storesPublicly: boolean
}

/**
 * Lo mínimo que el intake necesita de un archivo multipart.
 *
 * Se declara como subconjunto de `MultipartFile` en lugar de pedir el tipo
 * completo para que un módulo pueda construirlo desde su propia forma (el
 * comprobante de pago, por ejemplo) sin fabricar un `MultipartFile` entero, y
 * sin que nadie tenga que recurrir a `any` o a un cast opaco.
 */
export type IncomingFile = Pick<MultipartFile, 'tmpPath' | 'clientName' | 'extname' | 'size'>

const TITLE = 'Archivo no aceptado'

const IMAGE_MIME_SET: ReadonlySet<string> = new Set(FILE_INTAKE_IMAGE_MIMES)
const PDF_MIME_SET: ReadonlySet<string> = new Set(FILE_INTAKE_PDF_MIMES)
const AUDIO_MIME_SET: ReadonlySet<string> = new Set(FILE_INTAKE_AUDIO_MIMES)
const MP3_MIME_SET: ReadonlySet<string> = new Set(FILE_INTAKE_MP3_MIMES)
const SPREADSHEET_MIME_SET: ReadonlySet<string> = new Set(FILE_INTAKE_SPREADSHEET_MIMES)

/**
 * Puerta única de entrada de archivos.
 *
 * El orden de las comprobaciones es deliberado y va de barato a caro:
 * presencia, nombre declarado, tamaño declarado, contenido real, transformación
 * y tamaño final. Cada rechazo sale como `FileIntakeError` con el triplete del
 * estándar, nunca como excepción cruda.
 */
export default class FileIntakeService {
  /**
   * Acepta o rechaza un archivo multipart según su perfil.
   * @param file Archivo tal como lo entrega `request.file()`.
   * @param profileName Perfil de uso declarado por el modulo que lo recibe.
   */
  async accept(
    file: IncomingFile | null | undefined,
    profileName: FileIntakeProfileName
  ): Promise<FileIntakeResult> {
    const profile = FILE_INTAKE_PROFILES[profileName]

    this.assertFilePresent(file)
    this.assertClientFileNameAllowed(profile, file)
    this.assertDeclaredSizeWithinLimit(profile, file)

    const inputBuffer = await this.readTmpFile(file)

    // El tope se mide sobre lo que MANDO el usuario, no sobre el resultado de
    // la transformación. Re-encodear puede engordar el archivo (un JPEG que
    // sale PNG por política del perfil crece varias veces), y rechazarlo por
    // eso sería castigar al usuario por una decisión nuestra.
    this.assertSizeWithinLimit(profile, inputBuffer.length)

    const mimeType = await this.detectAllowedMime(profile, inputBuffer)
    const transformed = await this.transform(profile, inputBuffer, mimeType)

    return {
      buffer: transformed.buffer,
      mimeType: transformed.mimeType,
      fileSize: transformed.buffer.length,
      storageFileName: buildStorageFileName(transformed.mimeType),
      storesPublicly: profile.storesPublicly,
    }
  }

  private assertFilePresent(file: IncomingFile | null | undefined): asserts file is IncomingFile {
    if (!file || !file.tmpPath) {
      throw new FileIntakeError({
        title: TITLE,
        detail: 'No se recibió ningún archivo en la petición.',
        key: 'archivo-faltante',
        errorCode: FILE_INTAKE_ERROR_CODES.FILE_MISSING,
      })
    }
  }

  private assertClientFileNameAllowed(profile: FileIntakeProfile, file: IncomingFile): void {
    const rejection = rejectClientFileName(profile, file.clientName, file.extname ?? undefined)

    if (rejection === 'extension-blocked') {
      throw new FileIntakeError({
        title: TITLE,
        detail:
          'El nombre del archivo contiene una extensión de script, ejecutable o configuración.',
        key: 'extension-bloqueada',
        errorCode: FILE_INTAKE_ERROR_CODES.EXTENSION_BLOCKED,
      })
    }

    if (rejection === 'extension-not-allowed') {
      throw new FileIntakeError({
        title: TITLE,
        detail: `Solo se aceptan archivos ${this.formatExtensions(profile)}.`,
        key: 'extension-no-permitida',
        errorCode: FILE_INTAKE_ERROR_CODES.EXTENSION_NOT_ALLOWED,
      })
    }
  }

  /**
   * Primer filtro por el tamaño que DECLARA el multipart. Es barato y descarta
   * lo evidente antes de leer un byte del disco; no se confia en el, porque lo
   * declara el cliente: `assertSizeWithinLimit` vuelve a medir sobre el
   * contenido real.
   */
  private assertDeclaredSizeWithinLimit(profile: FileIntakeProfile, file: IncomingFile): void {
    if (typeof file.size === 'number' && file.size > profile.maxBytes) {
      throw this.tooLargeError(profile)
    }
  }

  /** Tope real, medido sobre el contenido que llego. */
  private assertSizeWithinLimit(profile: FileIntakeProfile, sizeInBytes: number): void {
    if (sizeInBytes > profile.maxBytes) {
      throw this.tooLargeError(profile)
    }
  }

  private async readTmpFile(file: IncomingFile): Promise<Buffer> {
    try {
      return await fs.readFile(file.tmpPath as string)
    } catch {
      throw new FileIntakeError({
        title: TITLE,
        detail: 'No fue posible leer el archivo recibido.',
        key: 'archivo-ilegible',
        errorCode: FILE_INTAKE_ERROR_CODES.SANITIZATION_FAILED,
        status: 400,
      })
    }
  }

  /**
   * Determina el formato REAL por magic bytes y lo contrasta con el perfil.
   * Un SVG o un script no producen firma reconocible y caen aquí; un binario
   * disfrazado de imagen cae aquí aunque su nombre y su `Content-Type` mientan.
   */
  private async detectAllowedMime(
    profile: FileIntakeProfile,
    inputBuffer: Buffer
  ): Promise<FileIntakeMime> {
    const detected = await fileType.fromBuffer(inputBuffer)
    const mimeType = detected?.mime

    if (!mimeType || !this.profileAllowsMime(profile, mimeType)) {
      throw new FileIntakeError({
        title: TITLE,
        detail: `El contenido del archivo no corresponde a ${this.formatExtensions(profile)}.`,
        key: 'contenido-no-corresponde',
        errorCode: FILE_INTAKE_ERROR_CODES.CONTENT_TYPE_INVALID,
      })
    }

    return mimeType
  }

  private profileAllowsMime(profile: FileIntakeProfile, mime: string): mime is FileIntakeMime {
    return (profile.allowedMimes as readonly string[]).includes(mime)
  }

  private async transform(
    profile: FileIntakeProfile,
    inputBuffer: Buffer,
    mimeType: FileIntakeMime
  ): Promise<{ buffer: Buffer; mimeType: FileIntakeMime }> {
    if (IMAGE_MIME_SET.has(mimeType)) {
      return this.transformImage(profile, inputBuffer, mimeType)
    }

    if (PDF_MIME_SET.has(mimeType)) {
      return this.transformPdf(inputBuffer, mimeType)
    }

    if (AUDIO_MIME_SET.has(mimeType)) {
      return this.transformAudio(inputBuffer, mimeType)
    }

    if (SPREADSHEET_MIME_SET.has(mimeType)) {
      // La hoja no se persiste ni se puede reconstruir sin alterar formulas:
      // la garantía aquí es que el contenido ES una hoja OOXML real.
      return { buffer: inputBuffer, mimeType }
    }

    throw this.sanitizationFailedError()
  }

  /**
   * Re-encodea la imagen. Reconstruir el pixel descarta EXIF, perfiles ICC,
   * capas y cualquier payload pegado después del fin del contenedor.
   * `rotate()` sin argumentos aplica la orientacion EXIF antes de descartarla.
   */
  private async transformImage(
    profile: FileIntakeProfile,
    inputBuffer: Buffer,
    mimeType: FileIntakeMime
  ): Promise<{ buffer: Buffer; mimeType: FileIntakeMime }> {
    const policy = profile.imagePolicy

    if (policy.kind === 'reject') {
      throw this.sanitizationFailedError()
    }

    const outputMime = policy.kind === 'convert' ? policy.toMime : mimeType
    const pipeline = sharp(inputBuffer).rotate()

    try {
      const buffer =
        outputMime === 'image/png'
          ? await pipeline.png().toBuffer()
          : outputMime === 'image/webp'
            ? await pipeline.webp().toBuffer()
            : await pipeline.jpeg({ quality: FILE_INTAKE_JPEG_QUALITY }).toBuffer()

      return { buffer, mimeType: outputMime }
    } catch {
      throw this.sanitizationFailedError()
    }
  }

  /** Limpia los metadatos del documento; el contenido de las paginas no se toca. */
  private async transformPdf(
    inputBuffer: Buffer,
    mimeType: FileIntakeMime
  ): Promise<{ buffer: Buffer; mimeType: FileIntakeMime }> {
    try {
      // Un PDF cifrado se rechaza en lugar de aceptarse: `ignoreEncryption`
      // permitía cargarlo, pero al volver a guardarlo se perdía el cifrado y el
      // archivo quedaba ilegible en el bucket. Es preferible avisar al usuario
      // de que su PDF está protegido que guardarle un documento roto.
      const pdfDoc = await PDFDocument.load(new Uint8Array(inputBuffer))

      pdfDoc.setTitle('')
      pdfDoc.setAuthor('')
      pdfDoc.setSubject('')
      pdfDoc.setKeywords([])
      pdfDoc.setProducer('')
      pdfDoc.setCreator('')
      pdfDoc.setCreationDate(new Date(0))
      pdfDoc.setModificationDate(new Date(0))

      return { buffer: Buffer.from(await pdfDoc.save()), mimeType }
    } catch {
      throw this.sanitizationFailedError()
    }
  }

  /**
   * `node-id3` solo entiende MP3. El audio grabado desde la app (AAC/m4a) es
   * una grabacion fresca sin tags identificantes y se persiste tal cual.
   */
  private transformAudio(
    inputBuffer: Buffer,
    mimeType: FileIntakeMime
  ): { buffer: Buffer; mimeType: FileIntakeMime } {
    if (!MP3_MIME_SET.has(mimeType)) {
      return { buffer: inputBuffer, mimeType }
    }

    const stripped = (
      nodeId3 as typeof nodeId3 & { removeTagsFromBuffer: (data: Buffer) => Buffer | false }
    ).removeTagsFromBuffer(inputBuffer)

    if (stripped === false) {
      throw this.sanitizationFailedError()
    }

    const buffer = Buffer.isBuffer(stripped) ? stripped : inputBuffer
    return { buffer, mimeType }
  }

  private tooLargeError(profile: FileIntakeProfile): FileIntakeError {
    const maxMegabytes = Math.round(profile.maxBytes / (1024 * 1024))
    return new FileIntakeError({
      title: TITLE,
      detail: `El archivo supera el tamaño máximo de ${maxMegabytes} MB.`,
      key: 'archivo-demasiado-grande',
      errorCode: FILE_INTAKE_ERROR_CODES.FILE_TOO_LARGE,
    })
  }

  private sanitizationFailedError(): FileIntakeError {
    return new FileIntakeError({
      title: TITLE,
      detail: 'El archivo está dañado o su contenido no pudo procesarse.',
      key: 'archivo-no-procesable',
      errorCode: FILE_INTAKE_ERROR_CODES.SANITIZATION_FAILED,
    })
  }

  private formatExtensions(profile: FileIntakeProfile): string {
    return profile.allowedClientExtensions.map((extension) => extension.toUpperCase()).join(', ')
  }
}
