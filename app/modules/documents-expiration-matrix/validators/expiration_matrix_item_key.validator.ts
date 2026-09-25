import vine from '@vinejs/vine'
import { EXPIRATION_MATRIX_KEY_PATTERN } from '../documents_expiration_matrix.constants.js'

/** Parámetro `:key` de `GET /api/documents-expiration-matrix/items/:key/file`. */
export const expirationMatrixItemKeyValidator = vine.compile(
  vine.object({
    key: vine.string().trim().maxLength(40).regex(EXPIRATION_MATRIX_KEY_PATTERN),
  })
)
