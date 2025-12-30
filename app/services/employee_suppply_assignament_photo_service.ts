import EmployeeSupplieAssignationPhoto from '#models/employee_supplie_assignation_photo'
import EmployeeSupplie from '#models/employee_supplie'
import UploadService from '#services/upload_service'

export default class EmployeeSuppplyAssignamentPhotoService {
  async uploadPhotos(
    employeeSupplyId: number,
    photos: any[],
    type: 'assignation' | 'return',
    uploadService: UploadService
  ) {
    const employeeSupply = await EmployeeSupplie.query()
      .where('employeeSupplyId', employeeSupplyId)
      .first()

    if (!employeeSupply) {
      return {
        status: 404,
        type: 'warning',
        title: 'Employee supply not found',
        message: 'The employee supply was not found',
        data: null,
      }
    }

    const uploadedPhotos = []

    for (const photo of photos) {
      if (!photo.isValid) {
        continue
      }

      const fileName = `${new Date().getTime()}_${photo.clientName}`
      const photoUrl = await uploadService.fileUpload(
        photo,
        'employee-supply-assignation-photos',
        fileName
      )

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
  ) {
    const employeeSupply = await EmployeeSupplie.query()
      .where('employeeSupplyId', employeeSupplyId)
      .first()

    if (!employeeSupply) {
      return {
        status: 404,
        type: 'warning',
        title: 'Employee supply not found',
        message: 'The employee supply was not found',
        data: null,
      }
    }

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
  ) {
    const photo = await EmployeeSupplieAssignationPhoto.query()
      .where('employeeSupplieAssignationPhotoId', photoId)
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

    const fileUrl = photo.employeeSupplieAssignationPhotoFile

    try {
      await uploadService.deleteFile(fileUrl)
    } catch (error) {
      // Continue even if S3 deletion fails
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

