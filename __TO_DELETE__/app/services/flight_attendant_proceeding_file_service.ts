import CustomerProceedingFile from '#models/customer_proceeding_file'
import EmployeeProceedingFile from '#models/employee_proceeding_file'
import FlightAttendant from '#models/flight_attendant'
import FlightAttendantProceedingFile from '#models/flight_attendant_proceeding_file'
import PilotProceedingFile from '#models/pilot_proceeding_file'
import ProceedingFile from '#models/proceeding_file'
import ProceedingFileType from '#models/proceeding_file_type'
import { DateTime } from 'luxon'
import { FlightAttendantProceedingFileFilterInterface } from '../interfaces/flight_attendant_proceeding_file_filter_interface.js'

export default class FlightAttendantProceedingFileService {
  async create(flightAttendantProceedingFile: FlightAttendantProceedingFile) {
    const newFlightAttendantProceedingFile = new FlightAttendantProceedingFile()
    newFlightAttendantProceedingFile.flightAttendantId =
      flightAttendantProceedingFile.flightAttendantId
    newFlightAttendantProceedingFile.proceedingFileId =
      flightAttendantProceedingFile.proceedingFileId
    await newFlightAttendantProceedingFile.save()
    return newFlightAttendantProceedingFile
  }

  async update(
    currentFlightAttendantProceedingFile: FlightAttendantProceedingFile,
    flightAttendantProceedingFile: FlightAttendantProceedingFile
  ) {
    currentFlightAttendantProceedingFile.flightAttendantId =
      flightAttendantProceedingFile.flightAttendantId
    currentFlightAttendantProceedingFile.proceedingFileId =
      flightAttendantProceedingFile.proceedingFileId
    await currentFlightAttendantProceedingFile.save()
    return currentFlightAttendantProceedingFile
  }

  async delete(currentFlightAttendantProceedingFile: FlightAttendantProceedingFile) {
    await currentFlightAttendantProceedingFile.delete()
    return currentFlightAttendantProceedingFile
  }

  async show(flightAttendantProceedingFileId: number) {
    const flightAttendantProceedingFile = await FlightAttendantProceedingFile.query()
      .whereNull('flight_attendant_proceeding_file_deleted_at')
      .where('flight_attendant_proceeding_file_id', flightAttendantProceedingFileId)
      .preload('proceedingFile', async (query) => {
        query.preload('proceedingFileType')
      })
      .first()
    return flightAttendantProceedingFile ? flightAttendantProceedingFile : null
  }

  async index() {
    const flightAttendantProceedingFile = await FlightAttendantProceedingFile.query()
      .whereNull('flight_attendant_proceeding_file_deleted_at')
      .orderBy('flight_attendant_proceeding_file_id')
    return flightAttendantProceedingFile ? flightAttendantProceedingFile : []
  }

  async verifyInfoExist(flightAttendantProceedingFile: FlightAttendantProceedingFile) {
    const existFlightAttendant = await FlightAttendant.query()
      .whereNull('flight_attendant_deleted_at')
      .where('flight_attendant_id', flightAttendantProceedingFile.flightAttendantId)
      .first()

    if (!existFlightAttendant && flightAttendantProceedingFile.flightAttendantId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The flight attendant was not found',
        message: 'The flight attendant was not found with the entered ID',
        data: { ...flightAttendantProceedingFile },
      }
    }

    const existProceedingFile = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .where('proceeding_file_id', flightAttendantProceedingFile.proceedingFileId)
      .first()

    if (!existProceedingFile && flightAttendantProceedingFile.proceedingFileId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was not found',
        message: 'The proceeding file was not found with the entered ID',
        data: { ...flightAttendantProceedingFile },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...flightAttendantProceedingFile },
    }
  }

  async verifyInfo(flightAttendantProceedingFile: FlightAttendantProceedingFile) {
    const action =
      flightAttendantProceedingFile.flightAttendantProceedingFileId > 0 ? 'updated' : 'created'
    const existFlightAttendantProceedingFile = await FlightAttendantProceedingFile.query()
      .whereNull('flight_attendant_proceeding_file_deleted_at')
      .if(flightAttendantProceedingFile.flightAttendantProceedingFileId > 0, (query) => {
        query.whereNot(
          'flight_attendant_proceeding_file_id',
          flightAttendantProceedingFile.flightAttendantProceedingFileId
        )
      })
      .where('flight_attendant_id', flightAttendantProceedingFile.flightAttendantId)
      .where('proceeding_file_id', flightAttendantProceedingFile.proceedingFileId)
      .first()
    if (existFlightAttendantProceedingFile) {
      return {
        status: 400,
        type: 'warning',
        title: 'The relation flight attendant proceeding file already exists',
        message: `The relation flight attendant proceeding file resource cannot be ${action} because the relation is already assigned`,
        data: { ...flightAttendantProceedingFile },
      }
    }
    const existEmployeeProceedingFile = await EmployeeProceedingFile.query()
      .whereNull('employee_proceeding_file_deleted_at')
      .where('proceeding_file_id', flightAttendantProceedingFile.proceedingFileId)
      .first()
    if (existEmployeeProceedingFile) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was assigned in employee proceeding files',
        message: `The relation flight attendant proceeding file resource cannot be ${action} because the proceeding file id was assigned in employee proceeding files`,
        data: { ...flightAttendantProceedingFile },
      }
    }
    const existPilotProceedingFile = await PilotProceedingFile.query()
      .whereNull('pilot_proceeding_file_deleted_at')
      .where('proceeding_file_id', flightAttendantProceedingFile.proceedingFileId)
      .first()
    if (existPilotProceedingFile) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was assigned in pilot proceeding files',
        message: `The relation flight attendant proceeding file resource cannot be ${action} because the proceeding file id was assigned in pilot proceeding files`,
        data: { ...flightAttendantProceedingFile },
      }
    }
    const existCustomerProceedingFile = await CustomerProceedingFile.query()
      .whereNull('customer_proceeding_file_deleted_at')
      .where('proceeding_file_id', flightAttendantProceedingFile.proceedingFileId)
      .first()
    if (existCustomerProceedingFile) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was assigned in customer proceeding files',
        message: `The relation flight attendant proceeding file resource cannot be ${action} because the proceeding file id was assigned in customer proceeding files`,
        data: { ...flightAttendantProceedingFile },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...flightAttendantProceedingFile },
    }
  }

  async getExpiredAndExpiring(filters: FlightAttendantProceedingFileFilterInterface) {
    const proceedingFileTypes = await ProceedingFileType.query()
      .whereNull('proceeding_file_type_deleted_at')
      .where('proceeding_file_type_area_to_use', 'flight-attendant')
      .orderBy('proceeding_file_type_id')
      .select('proceeding_file_type_id')

    const proceedingFileTypesIds = proceedingFileTypes.map((item) => item.proceedingFileTypeId)
    const proceedingFilesExpired = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .whereIn('proceeding_file_type_id', proceedingFileTypesIds)
      .whereBetween('proceeding_file_expiration_at', [filters.dateStart, filters.dateEnd])
      .preload('proceedingFileType')
      .preload('flightAttendantProceedingFile')
      .orderBy('proceeding_file_expiration_at')

    const newDateStart = DateTime.fromISO(filters.dateEnd).plus({ days: 1 }).toFormat('yyyy-MM-dd')
    const newDateEnd = DateTime.fromISO(filters.dateEnd).plus({ days: 30 }).toFormat('yyyy-MM-dd')
    const proceedingFilesExpiring = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .whereIn('proceeding_file_type_id', proceedingFileTypesIds)
      .whereBetween('proceeding_file_expiration_at', [newDateStart, newDateEnd])
      .preload('proceedingFileType')
      .preload('flightAttendantProceedingFile')
      .orderBy('proceeding_file_expiration_at')

    return {
      proceedingFilesExpired: proceedingFilesExpired ? proceedingFilesExpired : [],
      proceedingFilesExpiring: proceedingFilesExpiring ? proceedingFilesExpiring : [],
    }
  }
}
