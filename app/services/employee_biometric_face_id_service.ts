import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import UploadService from '#services/upload_service'

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
        // Si existe un registro, eliminar la foto anterior del S3
        if (existingRecord.employeeBiometricFaceIdPhotoUrl) {
          const deleteResult = await uploadService.deleteFile(
            existingRecord.employeeBiometricFaceIdPhotoUrl
          )

          // Continuar aunque haya error al eliminar (excepto si es un error crítico)
          if (deleteResult.status !== 200 && deleteResult.status !== 404) {
            // Si hay un error crítico, retornar error
            return {
              status: deleteResult.status || 500,
              type: 'error',
              title: 'Error al reemplazar foto',
              message: deleteResult.message || 'Error al eliminar la foto anterior',
              data: null,
            }
          }
        }

        // Actualizar el registro con la nueva URL
        const updated = await this.update(existingRecord, newPhotoUrl)
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
      return {
        status: 500,
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error al reemplazar la foto biométrica',
        data: { error: error.message },
      }
    }
  }
}

