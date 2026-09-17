import ProceedingFile from '#models/proceeding_file'
import ProceedingFileType from '#models/proceeding_file_type'
import { DateTime } from 'luxon'
import { AircraftProceedingFileFilterInterface } from '../interfaces/aircraft_proceeding_file_filter_interface.js'
import AircraftProceedingFile from '#models/aircraft_proceeding_file'
import PilotProceedingFile from '#models/pilot_proceeding_file'
import EmployeeProceedingFile from '#models/employee_proceeding_file'
import FlightAttendantProceedingFile from '#models/flight_attendant_proceeding_file'
import CustomerProceedingFile from '#models/customer_proceeding_file'
import Aircraft from '#models/aircraft'

export default class AircraftProceedingFileService {
  async create(aircraftProceedingFile: AircraftProceedingFile) {
    const newAircraftProceedingFile = new AircraftProceedingFile()
    newAircraftProceedingFile.aircraftId = aircraftProceedingFile.aircraftId
    newAircraftProceedingFile.proceedingFileId = aircraftProceedingFile.proceedingFileId
    await newAircraftProceedingFile.save()
    return newAircraftProceedingFile
  }

  async update(
    currentAircraftProceedingFile: AircraftProceedingFile,
    aircraftProceedingFile: AircraftProceedingFile
  ) {
    currentAircraftProceedingFile.aircraftId = aircraftProceedingFile.aircraftId
    currentAircraftProceedingFile.proceedingFileId = aircraftProceedingFile.proceedingFileId
    await currentAircraftProceedingFile.save()
    return currentAircraftProceedingFile
  }

  async show(aircraftProceedingFileId: number) {
    const aircraftProceedingFile = await AircraftProceedingFile.query()
      .whereNull('aircraft_proceeding_file_deleted_at')
      .where('aircraft_proceeding_file_id', aircraftProceedingFileId)
      .preload('proceedingFile', async (query) => {
        query.preload('proceedingFileType')
      })
      .first()
    return aircraftProceedingFile ? aircraftProceedingFile : null
  }

  async verifyInfoExist(aircraftProceedingFile: AircraftProceedingFile) {
    const existAircraft = await Aircraft.query()
      .whereNull('aircraft_deleted_at')
      .where('aircraft_id', aircraftProceedingFile.aircraftId)
      .first()

    if (!existAircraft && aircraftProceedingFile.aircraftId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The aircraft was not found',
        message: 'The aircraft was not found with the entered ID',
        data: { ...aircraftProceedingFile },
      }
    }

    const existProceedingFile = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .where('proceeding_file_id', aircraftProceedingFile.proceedingFileId)
      .first()

    if (!existProceedingFile && aircraftProceedingFile.proceedingFileId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was not found',
        message: 'The proceeding file was not found with the entered ID',
        data: { ...aircraftProceedingFile },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...aircraftProceedingFile },
    }
  }

  async verifyInfo(aircraftProceedingFile: AircraftProceedingFile) {
    const action = aircraftProceedingFile.aircraftProceedingFileId > 0 ? 'updated' : 'created'
    const existAircraftProceedingFile = await AircraftProceedingFile.query()
      .whereNull('aircraft_proceeding_file_deleted_at')
      .if(aircraftProceedingFile.aircraftProceedingFileId > 0, (query) => {
        query.whereNot(
          'aircraft_proceeding_file_id',
          aircraftProceedingFile.aircraftProceedingFileId
        )
      })
      .where('aircraft_id', aircraftProceedingFile.aircraftId)
      .where('proceeding_file_id', aircraftProceedingFile.proceedingFileId)
      .first()
    if (existAircraftProceedingFile) {
      return {
        status: 400,
        type: 'warning',
        title: 'The relation aircraft-proceedingfile already exists',
        message: `The relation aircraft proceeding file resource cannot be ${action} because the relation is already assigned`,
        data: { ...aircraftProceedingFile },
      }
    }
    const existPilotProceedingFile = await PilotProceedingFile.query()
      .whereNull('pilot_proceeding_file_deleted_at')
      .where('proceeding_file_id', aircraftProceedingFile.proceedingFileId)
      .first()
    if (existPilotProceedingFile) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was assigned in pilot proceeding files',
        message: `The relation aircraft proceeding file resource cannot be ${action} because the proceeding file id was assigned in pilot proceeding files`,
        data: { ...aircraftProceedingFile },
      }
    }
    const existEmployeeProceedingFile = await EmployeeProceedingFile.query()
      .whereNull('employee_proceeding_file_deleted_at')
      .where('proceeding_file_id', aircraftProceedingFile.proceedingFileId)
      .first()
    if (existEmployeeProceedingFile) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was assigned in employee proceeding files',
        message: `The relation aircraft proceeding file resource cannot be ${action} because the proceeding file id was assigned in employee proceeding files`,
        data: { ...aircraftProceedingFile },
      }
    }
    const existFlightAttendantProceedingFile = await FlightAttendantProceedingFile.query()
      .whereNull('flight_attendant_proceeding_file_deleted_at')
      .where('proceeding_file_id', aircraftProceedingFile.proceedingFileId)
      .first()
    if (existFlightAttendantProceedingFile) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was assigned in flight attendant proceeding files',
        message: `The relation aircraft proceeding file resource cannot be ${action} because the proceeding file id was assigned in flight attendant proceeding files`,
        data: { ...aircraftProceedingFile },
      }
    }
    const existCustomerProceedingFile = await CustomerProceedingFile.query()
      .whereNull('customer_proceeding_file_deleted_at')
      .where('proceeding_file_id', aircraftProceedingFile.proceedingFileId)
      .first()
    if (existCustomerProceedingFile) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was assigned in customer proceeding files',
        message: `The relation aircrafy proceeding file resource cannot be ${action} because the proceeding file id was assigned in customer proceeding files`,
        data: { ...aircraftProceedingFile },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...aircraftProceedingFile },
    }
  }

  async getExpiredAndExpiring(filters: AircraftProceedingFileFilterInterface) {
    const proceedingFileTypes = await ProceedingFileType.query()
      .whereNull('proceeding_file_type_deleted_at')
      .where('proceeding_file_type_area_to_use', 'aircraft')
      .orderBy('proceeding_file_type_id')
      .select('proceeding_file_type_id')

    const proceedingFileTypesIds = proceedingFileTypes.map((item) => item.proceedingFileTypeId)

    const proceedingFilesExpired = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .whereIn('proceeding_file_type_id', proceedingFileTypesIds)
      .whereBetween('proceeding_file_expiration_at', [filters.dateStart, filters.dateEnd])
      .whereHas('aircraftProceedingFile', (query) => {
        query.whereNull('aircraft_proceeding_file_deleted_at')
        query.whereHas('aircraft', (aircraftQuery) => {
          aircraftQuery.whereNull('aircraft_deleted_at')
        })
      })
      .preload('proceedingFileType')
      .preload('aircraftProceedingFile', (query) => {
        query.preload('aircraft', (aircraftQuery) => {
          aircraftQuery.whereNull('aircraft_deleted_at')
        })
      })
      .orderBy('proceeding_file_expiration_at')

    const newDateStart = DateTime.fromISO(filters.dateEnd).plus({ days: 1 }).toFormat('yyyy-MM-dd')
    const newDateEnd = DateTime.fromISO(filters.dateEnd).plus({ days: 30 }).toFormat('yyyy-MM-dd')

    const proceedingFilesExpiring = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .whereIn('proceeding_file_type_id', proceedingFileTypesIds)
      .whereBetween('proceeding_file_expiration_at', [newDateStart, newDateEnd])
      .whereHas('aircraftProceedingFile', (query) => {
        query.whereNull('aircraft_proceeding_file_deleted_at')
      })
      .preload('proceedingFileType')
      .preload('aircraftProceedingFile', (query) => {
        query.preload('aircraft')
      })
      .orderBy('proceeding_file_expiration_at')

    return {
      proceedingFilesExpired: proceedingFilesExpired ? proceedingFilesExpired : [],
      proceedingFilesExpiring: proceedingFilesExpiring ? proceedingFilesExpiring : [],
    }
  }
}
