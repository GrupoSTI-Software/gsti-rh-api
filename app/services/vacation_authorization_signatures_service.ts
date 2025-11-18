import UploadService from '#services/upload_service'
import VacationAuthorizationSignature from '#models/vacation_authorization_signature'
import ExceptionRequest from '#models/exception_request'
import ShiftException from '#models/shift_exception'
import ShiftExceptionService from '#services/shift_exception_service'
import ExceptionType from '#models/exception_type'
import { DateTime } from 'luxon'
import { I18n } from '@adonisjs/i18n'

/**
 * Service responsible for authorizing vacation requests using a signature file
 * and for retrieving pending/authorized vacation requests.
 */
export default class VacationAuthorizationSignaturesService {
  /**
   * Authorize multiple Exception Requests of type vacation by uploading a signature,
   * creating corresponding Shift Exceptions, saving signature records, and updating requests status.
   *
   * @param signatureFile - Uploaded PNG file (multipart)
   * @param requestIds - Array of Exception Request IDs to authorize
   * @param vacationSettingId - Vacation setting ID to use for ShiftExceptions
   * @returns Result object with created shift exceptions, signatures, updated requests and errors
   */
  async authorize(signatureFile: any, requestIds: number[], vacationSettingId: number, i18n: I18n) {
    // Ensure vacation exception type exists
    const vacationType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .first()

    if (!vacationType) {
      return {
        status: 404,
        type: 'warning',
        title: 'Exception Types',
        message: 'Vacation exception type was not found',
        data: null,
      }
    }

    // Upload signature to S3
    const uploader = new UploadService()
    const fileUrl = await uploader.fileUpload(signatureFile, 'vacation_signatures')
    if (!fileUrl || fileUrl === 'file_not_found' || fileUrl === 'S3Producer.fileUpload') {
      return {
        status: 500,
        type: 'error',
        title: 'Signature upload',
        message: 'Unable to upload the signature file',
        data: null,
      }
    }

    const shiftExceptionService = new ShiftExceptionService(i18n)
    const createdShiftExceptions: ShiftException[] = []
    const createdSignatures: VacationAuthorizationSignature[] = []
    const updatedRequests: ExceptionRequest[] = []
    const errors: Array<{ id: number; error: string }> = []

    for (const id of requestIds) {
      try {
        const req = await ExceptionRequest.query()
          .where('exception_request_id', id)
          .whereNull('exception_request_deleted_at')
          .first()

        if (!req) {
          errors.push({ id, error: 'request_not_found' })
          continue
        }

        if (req.exceptionTypeId !== vacationType.exceptionTypeId) {
          errors.push({ id, error: 'request_type_is_not_vacation' })
          continue
        }

        // crear shift exception basado en exception request
        const shiftException = {
          employeeId: req.employeeId,
          shiftExceptionsDescription: req.exceptionRequestDescription || 'vacation',
          shiftExceptionsDate: req.requestedDate
            ? DateTime.fromJSDate(new Date(req.requestedDate.toString())).setZone('UTC').toJSDate()
            : null,
          exceptionTypeId: req.exceptionTypeId,
          vacationSettingId: vacationSettingId,
          shiftExceptionCheckInTime: req.exceptionRequestCheckInTime,
          shiftExceptionCheckOutTime: req.exceptionRequestCheckOutTime,
        } as ShiftException

        const verify = await shiftExceptionService.verifyInfo(shiftException)
        if (verify.status !== 200) {
          errors.push({ id, error: verify.message })
          continue
        }

        const savedShift = await shiftExceptionService.create(shiftException)
        if (!savedShift) {
          errors.push({ id, error: 'unable_to_create_shift_exception' })
          continue
        }
        createdShiftExceptions.push(savedShift)

        const signatureRecord = await VacationAuthorizationSignature.create({
          exceptionRequestId: req.exceptionRequestId,
          shiftExceptionId: savedShift.shiftExceptionId,
          vacationAuthorizationSignatureFile: fileUrl,
        })
        createdSignatures.push(signatureRecord)

        req.exceptionRequestStatus = 'accepted'
        await req.save()
        updatedRequests.push(req)
      } catch (e: any) {
        errors.push({ id, error: e?.message || 'unexpected_error' })
      }
    }

    return {
      status: 201,
      type: 'success',
      title: 'Vacation authorization',
      message: 'Processing completed',
      data: {
        fileUrl,
        createdShiftExceptions,
        createdSignatures,
        updatedRequests,
        errors,
      },
    }
  }

  /**
   * Sign multiple Shift Exceptions of type vacation by uploading a signature
   * and saving signature records.
   *
   * @param signatureFile - Uploaded PNG file (multipart)
   * @param shiftExceptionIds - Array of Shift Exception IDs to sign
   * @returns Result object with created signatures and errors
   */
  async signShiftExceptions(signatureFile: any, shiftExceptionIds: number[]) {
    // Ensure vacation exception type exists
    const vacationType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .first()

    if (!vacationType) {
      return {
        status: 404,
        type: 'warning',
        title: 'Exception Types',
        message: 'Vacation exception type was not found',
        data: null,
      }
    }

    // Upload signature to S3
    const uploader = new UploadService()
    const fileUrl = await uploader.fileUpload(signatureFile, 'vacation_signatures')
    if (!fileUrl || fileUrl === 'file_not_found' || fileUrl === 'S3Producer.fileUpload') {
      return {
        status: 500,
        type: 'error',
        title: 'Signature upload',
        message: 'Unable to upload the signature file',
        data: null,
      }
    }

    const createdSignatures: VacationAuthorizationSignature[] = []
    const errors: Array<{ id: number; error: string }> = []

    for (const id of shiftExceptionIds) {
      try {
        const shiftException = await ShiftException.query()
          .where('shift_exception_id', id)
          .whereNull('shift_exceptions_deleted_at')
          .first()

        if (!shiftException) {
          errors.push({ id, error: 'shift_exception_not_found' })
          continue
        }

        if (shiftException.exceptionTypeId !== vacationType.exceptionTypeId) {
          errors.push({ id, error: 'shift_exception_type_is_not_vacation' })
          continue
        }

        const signatureRecord = await VacationAuthorizationSignature.create({
          exceptionRequestId: null, // No hay request asociado
          shiftExceptionId: shiftException.shiftExceptionId,
          vacationAuthorizationSignatureFile: fileUrl,
        })
        createdSignatures.push(signatureRecord)
      } catch (e: any) {
        errors.push({ id, error: e?.message || 'unexpected_error' })
      }
    }

    return {
      status: 201,
      type: 'success',
      title: 'Shift exceptions signed',
      message: 'Processing completed',
      data: {
        fileUrl,
        createdSignatures,
        errors,
      },
    }
  }

  /**
   * Retrieve pending vacation exception requests for an employee
   * @param employeeId Employee identifier
   */
  async getPending(employeeId: number) {
    const vacationType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .first()

    if (!vacationType) {
      return {
        status: 404,
        type: 'warning',
        title: 'Exception Types',
        message: 'Vacation exception type was not found',
        data: null,
      }
    }

    const pending = await ExceptionRequest.query()
      .where('employee_id', employeeId)
      .where('exception_type_id', vacationType.exceptionTypeId)
      .whereIn('exception_request_status', ['requested', 'pending'])
      .orderBy('requested_date', 'asc')

    return {
      status: 200,
      type: 'success',
      title: 'Pending vacation requests',
      message: 'Query successful',
      data: pending,
    }
  }

  /**
   * Retrieve authorized vacation exception requests and their signatures for an employee
   * @param employeeId Employee identifier
   */
  async getAuthorized(employeeId: number) {
    const vacationType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .first()

    if (!vacationType) {
      return {
        status: 404,
        type: 'warning',
        title: 'Exception Types',
        message: 'Vacation exception type was not found',
        data: null,
      }
    }

    const authorizedRequests = await ExceptionRequest.query()
      .where('employee_id', employeeId)
      .where('exception_type_id', vacationType.exceptionTypeId)
      .where('exception_request_status', 'accepted')
      .orderBy('requested_date', 'desc')

    const requestIds = authorizedRequests.map((r) => r.exceptionRequestId)
    const signatures = requestIds.length
      ? await VacationAuthorizationSignature.query().whereIn('exception_request_id', requestIds)
      : []

    return {
      status: 200,
      type: 'success',
      title: 'Authorized vacation requests',
      message: 'Query successful',
      data: { requests: authorizedRequests, signatures },
    }
  }

  /**
   * Retrieve vacation shift exceptions for an employee with specific vacation setting
   * @param employeeId Employee identifier
   * @param vacationSettingId Vacation setting identifier
   */
  async getVacationShiftExceptions(employeeId: number, vacationSettingId: number) {
    const vacationType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .first()

    if (!vacationType) {
      return {
        status: 404,
        type: 'warning',
        title: 'Exception Types',
        message: 'Vacation exception type was not found',
        data: null,
      }
    }

    const signatures = await VacationAuthorizationSignature.query()
      .whereNull('vacation_authorization_signature_deleted_at')
      .orderBy('vacation_authorization_signature_created_at', 'desc')

    const shiftExceptions = await ShiftException.query()
      .where('employee_id', employeeId)
      .where('exception_type_id', vacationType.exceptionTypeId)
      .where('vacation_setting_id', vacationSettingId)
      .whereNull('shift_exceptions_deleted_at')
      .orderBy('shift_exceptions_date', 'desc')

    const shiftExceptionsWithoutSignatures = shiftExceptions.filter((shiftException) => {
      return !signatures.some((signature) => signature.shiftExceptionId === shiftException.shiftExceptionId)
    })

    return {
      status: 200,
      type: 'success',
      title: 'Vacation shift exceptions without signatures',
      message: 'Query successful',
      data: shiftExceptionsWithoutSignatures,
    }
  }
}
