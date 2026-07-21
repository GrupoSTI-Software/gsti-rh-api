import { REPSE_EXPEDIENTE_ERROR_CODES } from '#constants/repse_expediente_error_codes'
import { RepseExpedienteError } from '#exceptions/repse_expediente_error'
import {
  EXPEDIENTE_ALLOWED_EXTENSIONS,
  EXPEDIENTE_ALLOWED_MIME_TYPES,
  MAX_EXPEDIENTE_FILE_BYTES,
} from './expediente.constants.js'

export function assertExpedienteFileValid(file: any): void {
  if (!file) {
    throw new RepseExpedienteError(
      "No se recibió el parámetro 'archivo' (tipo File) en la petición multipart/form-data.",
      REPSE_EXPEDIENTE_ERROR_CODES.VAL_DOCUMENTO,
      422,
      'archivo-faltante'
    )
  }

  const ext = (file.extname ?? '').toLowerCase()
  const mime = `${file.type ?? ''}/${file.subtype ?? ''}`.toLowerCase()

  if (
    !EXPEDIENTE_ALLOWED_EXTENSIONS.includes(ext as (typeof EXPEDIENTE_ALLOWED_EXTENSIONS)[number]) ||
    !EXPEDIENTE_ALLOWED_MIME_TYPES.includes(mime as (typeof EXPEDIENTE_ALLOWED_MIME_TYPES)[number])
  ) {
    throw new RepseExpedienteError(
      "Tipo de archivo no permitido para 'archivo'. Solo se acepta PDF.",
      REPSE_EXPEDIENTE_ERROR_CODES.VAL_DOCUMENTO,
      422,
      'documento-tipo-invalido'
    )
  }

  if (Number(file.size ?? 0) > MAX_EXPEDIENTE_FILE_BYTES) {
    throw new RepseExpedienteError(
      "El archivo enviado en 'archivo' excede el tamaño máximo de 10 MB.",
      REPSE_EXPEDIENTE_ERROR_CODES.VAL_DOCUMENTO,
      422,
      'documento-tamano-excedido'
    )
  }
}
