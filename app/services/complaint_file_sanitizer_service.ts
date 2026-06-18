import fs from 'node:fs/promises'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import nodeId3 from 'node-id3'
import fileType from 'file-type'
import {
  COMPLAINT_ATTACHMENT_ALLOWED_AUDIO_MIMES,
  COMPLAINT_ATTACHMENT_ALLOWED_IMAGE_MIMES,
  COMPLAINT_ATTACHMENT_ALLOWED_MIMES,
  COMPLAINT_ATTACHMENT_ALLOWED_PDF_MIMES,
  type ComplaintAttachmentAllowedMime,
} from '#constants/complaint_attachment'

export type SanitizedFileResult = {
  buffer: Buffer
  mimeType: ComplaintAttachmentAllowedMime
  fileSize: number
}

/**
 * Sanitiza adjuntos del buzón de quejas eliminando metadatos identificantes
 * (EXIF en imágenes, metadata en PDF, ID3 en audio) antes de persistir.
 */
export default class ComplaintFileSanitizerService {
  /**
   * Detecta el MIME real del archivo y lo sanitiza según su categoría.
   * Nunca devuelve el buffer original sin procesar.
   */
  async sanitizeFromPath(tmpPath: string): Promise<SanitizedFileResult> {
    const inputBuffer = await fs.readFile(tmpPath)
    return this.sanitizeBuffer(inputBuffer)
  }

  async sanitizeBuffer(inputBuffer: Buffer): Promise<SanitizedFileResult> {
    const detected = await fileType.fromBuffer(inputBuffer)
    const mimeType = detected?.mime as ComplaintAttachmentAllowedMime | undefined

    if (!mimeType || !this.isAllowedMime(mimeType)) {
      throw new Error('INVALID_FILE_TYPE')
    }

    if (COMPLAINT_ATTACHMENT_ALLOWED_IMAGE_MIMES.includes(mimeType as (typeof COMPLAINT_ATTACHMENT_ALLOWED_IMAGE_MIMES)[number])) {
      return this.sanitizeImage(inputBuffer, mimeType)
    }

    if (COMPLAINT_ATTACHMENT_ALLOWED_PDF_MIMES.includes(mimeType as (typeof COMPLAINT_ATTACHMENT_ALLOWED_PDF_MIMES)[number])) {
      return this.sanitizePdf(inputBuffer, mimeType)
    }

    return this.sanitizeAudio(inputBuffer, mimeType)
  }

  isAllowedMime(mime: string): mime is ComplaintAttachmentAllowedMime {
    return (COMPLAINT_ATTACHMENT_ALLOWED_MIMES as readonly string[]).includes(mime)
  }

  private async sanitizeImage(
    inputBuffer: Buffer,
    mimeType: ComplaintAttachmentAllowedMime
  ): Promise<SanitizedFileResult> {
    const format = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpeg'

    const buffer = await sharp(inputBuffer)
      .rotate()
      .toFormat(format)
      .toBuffer()

    return { buffer, mimeType, fileSize: buffer.length }
  }

  private async sanitizePdf(
    inputBuffer: Buffer,
    mimeType: ComplaintAttachmentAllowedMime
  ): Promise<SanitizedFileResult> {
    const pdfDoc = await PDFDocument.load(new Uint8Array(inputBuffer), {
      ignoreEncryption: true,
    })

    pdfDoc.setTitle('')
    pdfDoc.setAuthor('')
    pdfDoc.setSubject('')
    pdfDoc.setKeywords([])
    pdfDoc.setProducer('')
    pdfDoc.setCreator('')
    pdfDoc.setCreationDate(new Date(0))
    pdfDoc.setModificationDate(new Date(0))

    const buffer = Buffer.from(await pdfDoc.save())
    return { buffer, mimeType, fileSize: buffer.length }
  }

  private sanitizeAudio(
    inputBuffer: Buffer,
    mimeType: ComplaintAttachmentAllowedMime
  ): Promise<SanitizedFileResult> {
    if (!COMPLAINT_ATTACHMENT_ALLOWED_AUDIO_MIMES.includes(mimeType as (typeof COMPLAINT_ATTACHMENT_ALLOWED_AUDIO_MIMES)[number])) {
      throw new Error('INVALID_FILE_TYPE')
    }

    const stripped = (
      nodeId3 as typeof nodeId3 & { removeTagsFromBuffer: (data: Buffer) => Buffer | false }
    ).removeTagsFromBuffer(inputBuffer)

    if (stripped === false) {
      throw new Error('INVALID_FILE_TYPE')
    }

    const buffer = Buffer.isBuffer(stripped) ? stripped : inputBuffer

    return Promise.resolve({
      buffer,
      mimeType,
      fileSize: buffer.length,
    })
  }
}
