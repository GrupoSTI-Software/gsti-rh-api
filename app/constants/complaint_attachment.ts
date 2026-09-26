/**
 * Constantes propias del buzón de quejas que sobreviven a la unificación de la
 * entrada de archivos.
 *
 * Los MIME permitidos, las extensiones de cliente, la blocklist, el tope de
 * tamaño y la extensión de almacenamiento vivían aquí; ahora son el perfil
 * `complaint-attachment` de `app/constants/file_intake.ts`, que es la fuente
 * única para todo el sistema. Mantener aquí una copia solo invitaba a que las
 * dos listas divergieran.
 */

/** Carpeta lógica en S3 bajo `{AWS_ROOT_PATH}/files/...`. */
export const COMPLAINT_ATTACHMENT_S3_FOLDER = 'complaint-attachments'

/** Vigencia de la URL firmada de descarga (5 minutos). */
export const COMPLAINT_ATTACHMENT_SIGNED_URL_EXPIRES_SECONDS = 5 * 60
