/**
 * Códigos de error para archivador de vacaciones de empleados (evidencias)
 * Formato: VAC.ARCH.XXX
 */
export const EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES = {
  /** Archivador no encontrado */
  ARCHIVE_NOT_FOUND: {
    code: 'VAC.ARCH.001',
    message: 'Archivador de vacaciones no encontrado',
    description:
      'No existe un archivador de vacaciones con el identificador proporcionado o fue eliminado.',
  },

  /** Empleado no encontrado */
  EMPLOYEE_NOT_FOUND: {
    code: 'VAC.ARCH.002',
    message: 'Empleado no encontrado',
    description: 'El empleado indicado no existe o fue eliminado.',
  },

  /** Excepción de turno no encontrada */
  SHIFT_EXCEPTION_NOT_FOUND: {
    code: 'VAC.ARCH.003',
    message: 'Excepción de turno no encontrada',
    description: 'La excepción de turno indicada no existe o fue eliminada.',
  },

  /** Excepción de turno no es de tipo vacaciones */
  SHIFT_EXCEPTION_NOT_VACATION_TYPE: {
    code: 'VAC.ARCH.009',
    message: 'Excepción de turno no es de tipo vacaciones',
    description:
      'Solo se pueden vincular excepciones de turno cuyo tipo tenga slug "vacation".',
  },

  /** Excepción de turno ya vinculada a otro archivador */
  SHIFT_EXCEPTION_ALREADY_LINKED: {
    code: 'VAC.ARCH.010',
    message: 'Excepción de turno ya vinculada',
    description: 'La excepción de turno ya está asociada a otro archivador de vacaciones.',
  },

  /** Configuración de vacaciones no encontrada */
  VACATION_SETTING_NOT_FOUND: {
    code: 'VAC.ARCH.004',
    message: 'Configuración de vacaciones no encontrada',
    description: 'La configuración de vacaciones indicada no existe o fue eliminada.',
  },

  /** Archivo no proporcionado */
  FILE_NOT_PROVIDED: {
    code: 'VAC.ARCH.005',
    message: 'Archivo no proporcionado',
    description: 'No se envió ningún archivo en la petición. Debe adjuntar una foto o PDF como evidencia.',
  },

  /** Archivo excede tamaño máximo (5MB) */
  FILE_TOO_LARGE: {
    code: 'VAC.ARCH.006',
    message: 'El archivo excede el tamaño máximo permitido',
    description:
      'El archivo no puede superar 5MB. Comprima la imagen o el PDF e intente de nuevo.',
  },

  /** Tipo de archivo no permitido (solo imagen o PDF) */
  INVALID_FILE_TYPE: {
    code: 'VAC.ARCH.007',
    message: 'Tipo de archivo no permitido',
    description:
      'Solo se permiten imágenes (jpg, jpeg, png, gif, webp) y documentos PDF como evidencias.',
  },

  /** Contenido del archivador no encontrado */
  CONTENT_NOT_FOUND: {
    code: 'VAC.ARCH.008',
    message: 'Contenido del archivador no encontrado',
    description: 'El archivo de evidencia indicado no existe o fue eliminado.',
  },
} as const

export type EmployeeVacationArchiveErrorCode = keyof typeof EMPLOYEE_VACATION_ARCHIVE_ERROR_CODES
