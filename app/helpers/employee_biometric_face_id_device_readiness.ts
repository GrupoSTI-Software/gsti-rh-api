import { readFile } from 'node:fs/promises'
import logger from '@adonisjs/core/services/logger'
import PhotoDerivativeService from '#modules/biometric-vault/photo/photo_derivative.service'
import type { PhotoVerdict } from '#modules/biometric-vault/photo/photo.constants'
import {
  EMPLOYEE_BIOMETRIC_FACE_ID_ERROR_CODES,
  type EmployeeBiometricFaceIdQualityRejection,
} from '#helpers/employee_biometric_face_id_quality'

/** Cuerpo del rechazo con el motivo del checador, para que el cliente lo nombre. */
export type EmployeeBiometricFaceIdReadinessRejection = EmployeeBiometricFaceIdQualityRejection & {
  readonly body: EmployeeBiometricFaceIdQualityRejection['body'] & {
    readonly verdict: PhotoVerdict | null
  }
}

export type EmployeeBiometricFaceIdReadinessCheck =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly rejection: EmployeeBiometricFaceIdReadinessRejection }

/**
 * Admite la foto biometrica solo si tambien sirve en un checador.
 *
 * La foto es una sola: la app la usa para verificar al colaborador y, si se
 * enciende el uso en dispositivos, es la que baja cada checador. Revisarla hasta
 * encender el interruptor dejaba fotos guardadas que la app aceptaba y ningun
 * aparato podia usar, y el problema se descubria cuando ya nadie estaba frente
 * a la camara. Aqui se construye el mismo derivado que viajaria al equipo y, si
 * no sale, la foto no entra.
 *
 * Fail-closed si no se puede evaluar: sin veredicto no hay garantia, y se
 * responde 500 para no culpar a la foto de un fallo del servidor.
 *
 * @param tmpPath Ruta temporal del archivo recibido en el multipart.
 */
export async function checkEmployeeBiometricFaceIdDeviceReadiness(
  tmpPath: string | undefined,
  derivatives: PhotoDerivativeService = new PhotoDerivativeService()
): Promise<EmployeeBiometricFaceIdReadinessCheck> {
  try {
    if (!tmpPath) throw new Error('el archivo recibido no tiene ruta temporal')
    const outcome = await derivatives.buildFromBuffer(await readFile(tmpPath))
    if (outcome.ok) return { accepted: true }
    return {
      accepted: false,
      rejection: {
        status: 422,
        body: {
          type: 'error',
          title: 'La foto no sirve para reconocer el rostro',
          detail: outcome.detail,
          key: 'employee_biometric_face_id_not_device_ready',
          code: EMPLOYEE_BIOMETRIC_FACE_ID_ERROR_CODES.NOT_DEVICE_READY,
          verdict: outcome.verdict,
        },
      },
    }
  } catch (error) {
    logger.error(
      { error: (error as Error).message.slice(0, 200) },
      'foto biometrica: no se pudo evaluar si sirve en un checador'
    )
    return {
      accepted: false,
      rejection: {
        status: 500,
        body: {
          type: 'error',
          title: 'No se pudo revisar la foto',
          detail:
            'El servidor no logro evaluar la foto y no se guardo. Intenta de nuevo; si se repite, avisa a soporte.',
          key: 'employee_biometric_face_id_evaluation_failed',
          code: EMPLOYEE_BIOMETRIC_FACE_ID_ERROR_CODES.EVALUATION_FAILED,
          verdict: null,
        },
      },
    }
  }
}
