/**
 * Códigos estables para el cliente del aviso de privacidad de la evidencia
 * fotográfica del puesto de trabajo (VLRH-H1791306079310, §11). Prefijo
 * TWN = TeleWork Notice.
 *
 * Es el catálogo COMPLETO del contrato de §11, no solo los que cablea esta HU:
 * quien consume el aviso (`VLRH-H1791311160233`, `VLRH-H1791311160825` y
 * `VLRH-H1791311161420`) lee de aquí, así que el cliente nunca tiene que
 * adivinar un código por el módulo que lo respondió.
 *
 * No se declaran `TWN.NF.003`, `TWN.VAL.004` ni `TWN.VAL.GATING.001`: están
 * reservados a `VLRH-H1791311160825`. Tampoco se reutilizan `TWP` (política) ni
 * `TWC` (listas de verificación).
 */
export const TELEWORK_PHOTO_NOTICE_ERROR_CODES = {
  /** El cuerpo del request no cumple el esquema esperado (Vine). */
  INVALID_INPUT: 'TWN.VAL.001',
  /** Al publicar, el texto usa un marcador fuera de la lista cerrada. */
  UNKNOWN_PLACEHOLDER: 'TWN.VAL.002',
  /** Al publicar, el texto quedó sin contenido después de sanearlo. */
  EMPTY_CONTENT: 'TWN.VAL.003',
  /** Ya existe un borrador vivo para la empresa; se edita ese. */
  DRAFT_ALREADY_EXISTS: 'TWN.CONF.001',
  /**
   * La empresa todavía no tiene una versión publicada del aviso.
   *
   * Se declara aquí aunque en esta HU la responda el servicio como fallo
   * cerrado del alcance no resuelto; el 404 por negocio lo expone
   * `VLRH-H1791311160825` con sus rutas de app.
   */
  NOTICE_NOT_PUBLISHED: 'TWN.NF.001',
  /** La empresa no tiene un borrador vivo del aviso. */
  DRAFT_NOT_FOUND: 'TWN.NF.002',
  /** No hay una plantilla base vigente del aviso (aún no sembrada). */
  TEMPLATE_NOT_FOUND: 'TWN.NF.004',
  /** Un usuario sin permiso del módulo de teletrabajo intentó leer/escribir el aviso. */
  FORBIDDEN: 'TWN.AUTH.001',
  /**
   * Error no contemplado del aviso (500).
   *
   * Se declara aquí aunque ninguna ruta de esta HU lo emita: el sobre de error
   * inesperado lo responde otra HU y el cliente lo lee de este mismo catálogo.
   */
  UNEXPECTED: 'TWN.SYS.001',
} as const

export type TeleworkPhotoNoticeErrorCode =
  (typeof TELEWORK_PHOTO_NOTICE_ERROR_CODES)[keyof typeof TELEWORK_PHOTO_NOTICE_ERROR_CODES]
