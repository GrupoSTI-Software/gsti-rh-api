import EmployeeSupplieAssignationPhoto from '#models/employee_supplie_assignation_photo'
import EmployeeSupplie from '#models/employee_supplie'
import UploadService from '#services/upload_service'

/** Respuesta uniforme del apartado (no homologar en esta historia). */
type PhotoServiceResult = {
  status: number
  type: 'success' | 'warning' | 'error'
  title: string
  message: string
  data: unknown
}

export default class EmployeeSuppplyAssignamentPhotoService {
  /**
   * Resuelve el insumo asignado dentro del TenantContext activo.
   * Padre ajeno o inexistente → mismo 404 (no revelar cross-tenant).
   */
  private async findEmployeeSupplyOrNotFound(
    employeeSupplyId: number
  ): Promise<{ ok: true; employeeSupply: EmployeeSupplie } | { ok: false; result: PhotoServiceResult }> {
    const employeeSupply = await EmployeeSupplie.query()
      .where('employeeSupplyId', employeeSupplyId)
      .first()

    if (!employeeSupply) {
      return {
        ok: false,
        result: {
          status: 404,
          type: 'warning',
          title: 'Employee supply not found',
          message: 'The employee supply was not found',
          data: null,
        },
      }
    }

    return { ok: true, employeeSupply }
  }

  async uploadPhotos(
    employeeSupplyId: number,
    photos: any[],
    type: 'assignation' | 'return',
    uploadService: UploadService
  ): Promise<PhotoServiceResult> {
    const resolved = await this.findEmployeeSupplyOrNotFound(employeeSupplyId)
    if (!resolved.ok) return resolved.result

    const uploadedPhotos = []

    for (const photo of photos) {
      if (!photo.isValid) {
        continue
      }

      const photoUrl = await uploadService.fileUpload(photo, 'profile-photo', 'employee-supply-assignation-photos')

      if (photoUrl === 'file_not_found' || photoUrl === 'S3Producer.fileUpload') {
        continue
      }

      const assignationPhoto = await EmployeeSupplieAssignationPhoto.create({
        employeeSupplyId,
        employeeSupplieAssignationPhotoType: type,
        employeeSupplieAssignationPhotoFile: photoUrl,
      })

      uploadedPhotos.push(assignationPhoto)
    }

    if (uploadedPhotos.length === 0) {
      return {
        status: 400,
        type: 'warning',
        title: 'No valid photos',
        message: 'No valid photos were uploaded',
        data: null,
      }
    }

    return {
      status: 201,
      type: 'success',
      title: 'Photos uploaded',
      message: 'Photos uploaded successfully',
      data: uploadedPhotos,
    }
  }

  async getPhotosByType(
    employeeSupplyId: number,
    type: 'assignation' | 'return'
  ): Promise<PhotoServiceResult> {
    const resolved = await this.findEmployeeSupplyOrNotFound(employeeSupplyId)
    if (!resolved.ok) return resolved.result

    const photos = await EmployeeSupplieAssignationPhoto.query()
      .where('employeeSupplyId', employeeSupplyId)
      .where('employeeSupplieAssignationPhotoType', type)
      .orderBy('employeeSupplieAssignationPhotoCreatedAt', 'desc')

    return {
      status: 200,
      type: 'success',
      title: 'Photos retrieved',
      message: 'Photos retrieved successfully',
      data: photos,
    }
  }

  async deletePhoto(
    photoId: number,
    uploadService: UploadService
  ): Promise<PhotoServiceResult> {
    // `EmployeeSupplieAssignationPhoto` no compone el mixin de empresa, asi que
    // consultarla por su propio identificador no hereda el filtro del contexto:
    // se acota por la relacion con `EmployeeSupplie`, que si es tenant-scoped.
    // Sin esto, el identificador que llega por la ruta permitia borrar la foto
    // de otra empresa, y con ella su objeto en el bucket.
    const photo = await EmployeeSupplieAssignationPhoto.query()
      .where('employeeSupplieAssignationPhotoId', photoId)
      .whereIn('employee_supply_id', EmployeeSupplie.query().select('employee_supply_id'))
      .first()

    if (!photo) {
      return {
        status: 404,
        type: 'warning',
        title: 'Photo not found',
        message: 'The photo was not found',
        data: null,
      }
    }

    const resolved = await this.findEmployeeSupplyOrNotFound(photo.employeeSupplyId)
    if (!resolved.ok) {
      return {
        status: 404,
        type: 'warning',
        title: 'Photo not found',
        message: 'The photo was not found',
        data: null,
      }
    }

    const fileUrl = photo.employeeSupplieAssignationPhotoFile

    try {
      await uploadService.deleteFile(fileUrl)
    } catch {
      // Continuar aunque falle el borrado en S3 (comportamiento vigente).
    }

    await photo.delete()

    return {
      status: 200,
      type: 'success',
      title: 'Photo deleted',
      message: 'Photo deleted successfully',
      data: null,
    }
  }
}

