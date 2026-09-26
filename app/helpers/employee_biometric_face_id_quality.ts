/**
 * Regla de admision de la foto biometrica facial por calidad de captura.
 *
 * El cliente mide la calidad sobre la imagen que va a subir y la manda en el
 * campo `quality` del multipart; aqui se decide si entra. La regla vive en un
 * helper y no repetida en `uploadPhoto` y `replacePhoto` porque son dos
 * llamadas de la misma politica.
 */

/**
 * Calidad minima de captura que se acepta para el rostro biometrico.
 *
 * Por debajo de este valor la plantilla no sirve para el marcaje facial, asi
 * que la foto no se guarda ni llega a S3. El Backoffice aplica el mismo corte
 * antes de enviar (`BIOMETRIC_FACE_MIN_QUALITY`); este es el que manda.
 */
export const EMPLOYEE_BIOMETRIC_FACE_ID_MIN_QUALITY = 90

/**
 * Catalogo estable de rechazos por calidad del rostro biometrico.
 *
 * Separado de `FILE_INTAKE_ERROR_CODES`: aquel es transversal y dice por que un
 * archivo no se pudo ingerir. Aqui el archivo se ingiere bien; lo que no pasa
 * es la regla de negocio del reconocimiento facial.
 */
export const EMPLOYEE_BIOMETRIC_FACE_ID_ERROR_CODES = {
  /** La medicion no llego, o llego ilegible o fuera de 0-100. */
  QUALITY_MISSING: 'EBFI.VAL.001',
  /** La calidad medida esta por debajo del minimo de reconocimiento. */
  QUALITY_BELOW_MINIMUM: 'EBFI.VAL.002',
} as const

export type EmployeeBiometricFaceIdErrorCode =
  (typeof EMPLOYEE_BIOMETRIC_FACE_ID_ERROR_CODES)[keyof typeof EMPLOYEE_BIOMETRIC_FACE_ID_ERROR_CODES]

/** Cuerpo del rechazo: triplete titulo/detalle/key mas el codigo estable. */
export interface EmployeeBiometricFaceIdQualityRejection {
  readonly status: number
  readonly body: {
    readonly type: 'error'
    readonly title: string
    readonly detail: string
    readonly key: string
    readonly code: EmployeeBiometricFaceIdErrorCode
  }
}

/** O la calidad aceptada, o el rechazo ya formateado. */
export type EmployeeBiometricFaceIdQualityCheck =
  | { readonly accepted: true; readonly quality: number }
  | { readonly accepted: false; readonly rejection: EmployeeBiometricFaceIdQualityRejection }

/**
 * Normaliza la calidad recibida en el multipart.
 *
 * Viaja como texto, asi que se pasa a entero. Devuelve `null` cuando no vino,
 * no es numerica o cae fuera de 0-100: en los tres casos no hay medicion en la
 * que confiar.
 */
const parseQuality = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === '') return null

  const value = Number(raw)
  if (!Number.isFinite(value)) return null

  const rounded = Math.round(value)
  if (rounded < 0 || rounded > 100) return null

  return rounded
}

/**
 * Aplica la regla de admision sobre el campo `quality` de la peticion.
 *
 * Fail-closed: sin medicion no se acepta la foto. Aceptar la ausencia
 * convertiria el umbral en opcional para cualquier cliente que omita el campo,
 * y el servidor es la autoridad de esta regla, no el cliente.
 *
 * @param raw Valor crudo de `request.input('quality')`.
 * @returns La calidad admitida, o el rechazo listo para responder.
 */
export function checkEmployeeBiometricFaceIdQuality(
  raw: unknown
): EmployeeBiometricFaceIdQualityCheck {
  const quality = parseQuality(raw)

  if (quality === null) {
    return {
      accepted: false,
      rejection: {
        status: 422,
        body: {
          type: 'error',
          title: 'Calidad de la foto no verificable',
          detail:
            'La peticion no trae la medicion de calidad de la captura, asi que la foto no se guardo. Vuelve a tomarla desde el Backoffice.',
          key: 'employee_biometric_face_id_quality_missing',
          code: EMPLOYEE_BIOMETRIC_FACE_ID_ERROR_CODES.QUALITY_MISSING,
        },
      },
    }
  }

  if (quality < EMPLOYEE_BIOMETRIC_FACE_ID_MIN_QUALITY) {
    return {
      accepted: false,
      rejection: {
        status: 422,
        body: {
          type: 'error',
          title: 'Calidad de la foto insuficiente',
          detail: `La foto alcanzo ${quality}% de calidad y se requiere al menos ${EMPLOYEE_BIOMETRIC_FACE_ID_MIN_QUALITY}%. Repitela con mejor luz y el rostro mas cerca de la camara.`,
          key: 'employee_biometric_face_id_quality_below_minimum',
          code: EMPLOYEE_BIOMETRIC_FACE_ID_ERROR_CODES.QUALITY_BELOW_MINIMUM,
        },
      },
    }
  }

  return { accepted: true, quality }
}
