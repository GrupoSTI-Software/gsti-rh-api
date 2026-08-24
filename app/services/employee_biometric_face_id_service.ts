import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import UploadService from '#services/upload_service'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'
import { isSensitiveDataWriteError } from '#helpers/sensitive_data_write_api_error'

export default class EmployeeBiometricFaceIdService {



  /**
   * Obtiene el registro de foto biométrica de un empleado (solo activos)
   */
  async findByEmployeeId(employeeId: number): Promise<EmployeeBiometricFaceId | null> {
    return await EmployeeBiometricFaceId.query()
      .where('employee_id', employeeId)
      .whereNull('employee_biometric_face_id_deleted_at')
      .first()
  }

  /**
   * Obtiene el registro de foto biométrica de un empleado (incluyendo eliminados)
   */
  async findByEmployeeIdWithTrashed(employeeId: number): Promise<EmployeeBiometricFaceId | null> {
    return await EmployeeBiometricFaceId.query()
      .where('employee_id', employeeId)
      .withTrashed()
      .first()
  }

  /**
   * Crea un nuevo registro de foto biométrica o reactiva uno eliminado si existe
   */
  async create(employeeId: number, photoUrl: string): Promise<EmployeeBiometricFaceId> {
    // Verificar si existe un registro eliminado (soft delete)
    const deletedRecord = await this.findByEmployeeIdWithTrashed(employeeId)

    if (deletedRecord && deletedRecord.deletedAt) {
      // Reactivar el registro eliminado
      deletedRecord.deletedAt = null
      deletedRecord.employeeBiometricFaceIdPhotoUrl = photoUrl
      await deletedRecord.save()
      return deletedRecord
    }

    // Crear nuevo registro
    const biometricFaceId = new EmployeeBiometricFaceId()
    biometricFaceId.employeeId = employeeId
    biometricFaceId.employeeBiometricFaceIdPhotoUrl = photoUrl

    await biometricFaceId.save()
    return biometricFaceId
  }

  /**
   * Actualiza la foto biométrica de un empleado
   */
  async update(
    biometricFaceId: EmployeeBiometricFaceId,
    photoUrl: string
  ): Promise<EmployeeBiometricFaceId> {
    biometricFaceId.employeeBiometricFaceIdPhotoUrl = photoUrl
    await biometricFaceId.save()
    return biometricFaceId
  }

  /**
   * Elimina la foto biométrica (soft delete)
   */
  async delete(biometricFaceId: EmployeeBiometricFaceId): Promise<boolean> {
    await biometricFaceId.delete()
    return true
  }

  /**
   * Elimina la foto del S3 y luego elimina el registro de la base de datos
   */
  async deletePhotoAndRecord(
    biometricFaceId: EmployeeBiometricFaceId,
    uploadService: UploadService
  ): Promise<{ status: number; type: string; title: string; message: string; data: any }> {
    try {
      // Eliminar la foto del S3
      if (biometricFaceId.employeeBiometricFaceIdPhotoUrl) {
        const deleteResult = await uploadService.deleteFile(
          biometricFaceId.employeeBiometricFaceIdPhotoUrl
        )

        if (deleteResult.status !== 200 && deleteResult.status !== 404) {
          // Si hay un error al eliminar del S3 pero no es 404 (archivo no encontrado), retornar error
          return {
            status: deleteResult.status || 500,
            type: 'error',
            title: 'Error al eliminar foto',
            message: deleteResult.message || 'Error al eliminar la foto del almacenamiento',
            data: null,
          }
        }
      }

      // Eliminar el registro de la base de datos
      await this.delete(biometricFaceId)

      return {
        status: 200,
        type: 'success',
        title: 'Foto eliminada',
        message: 'La foto biométrica fue eliminada exitosamente',
        data: { employeeBiometricFaceIdId: biometricFaceId.employeeBiometricFaceIdId },
      }
    } catch (error: any) {
      return {
        status: 500,
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error al eliminar la foto biométrica',
        data: { error: error.message },
      }
    }
  }

  /**
   * Reemplaza la foto biométrica: elimina la anterior del S3 y crea/actualiza con la nueva
   */
  async replacePhoto(
    employeeId: number,
    newPhotoUrl: string,
    uploadService: UploadService
  ): Promise<{ status: number; type: string; title: string; message: string; data: any }> {
    try {
      const existingRecord = await this.findByEmployeeId(employeeId)

      if (existingRecord) {
        // Guardar primero, borrar después: si `update` lanza por falta de permiso
        // de categoría sensible, la foto anterior en S3 no debe perderse.
        const oldPhotoUrl = existingRecord.employeeBiometricFaceIdPhotoUrl
        const updated = await this.update(existingRecord, newPhotoUrl)

        if (oldPhotoUrl) {
          // Nota: si el borrado del objeto anterior en S3 falla aquí, el registro ya
          // quedó actualizado correctamente; no se revierte el save por un fallo de
          // limpieza de almacenamiento no crítico.
          await uploadService.deleteFile(oldPhotoUrl)
        }

        return {
          status: 200,
          type: 'success',
          title: 'Foto reemplazada',
          message: 'La foto biométrica fue reemplazada exitosamente',
          data: { employeeBiometricFaceId: updated },
        }
      } else {
        // Si no existe, crear un nuevo registro
        const created = await this.create(employeeId, newPhotoUrl)
        return {
          status: 201,
          type: 'success',
          title: 'Foto creada',
          message: 'La foto biométrica fue creada exitosamente',
          data: { employeeBiometricFaceId: created },
        }
      }
    } catch (error: any) {
      if (isSensitiveDataWriteError(error)) throw error
      return {
        status: 500,
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error al reemplazar la foto biométrica',
        data: { error: error.message },
      }
    }
  }

  /**
   * Actualiza el token de la foto biométrica
   */
  async updateToken(
    biometricFaceId: EmployeeBiometricFaceId,
    token: string
  ): Promise<EmployeeBiometricFaceId> {
    return SensitiveAccessContext.runUnguarded(
      'renovación del token biométrico en consulta de foto de rostro',
      async () => {
        biometricFaceId.employeeBiometricFaceIdToken = token
        await biometricFaceId.save()
        return biometricFaceId
      }
    )
  }
}

