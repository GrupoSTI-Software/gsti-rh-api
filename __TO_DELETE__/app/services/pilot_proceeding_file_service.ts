import CustomerProceedingFile from '#models/customer_proceeding_file'
import EmployeeProceedingFile from '#models/employee_proceeding_file'
import FlightAttendantProceedingFile from '#models/flight_attendant_proceeding_file'
import Pilot from '#models/pilot'
import PilotProceedingFile from '#models/pilot_proceeding_file'
import ProceedingFile from '#models/proceeding_file'
import ProceedingFileType from '#models/proceeding_file_type'
import { DateTime } from 'luxon'
import { PilotProceedingFileFilterInterface } from '../interfaces/pilot_proceeding_file_filter_interface.js'

export default class PilotProceedingFileService {
  async create(pilotProceedingFile: PilotProceedingFile) {
    const newPilotProceedingFile = new PilotProceedingFile()
    newPilotProceedingFile.pilotId = pilotProceedingFile.pilotId
    newPilotProceedingFile.proceedingFileId = pilotProceedingFile.proceedingFileId
    await newPilotProceedingFile.save()
    return newPilotProceedingFile
  }

  async update(
    currentPilotProceedingFile: PilotProceedingFile,
    pilotProceedingFile: PilotProceedingFile
  ) {
    currentPilotProceedingFile.pilotId = pilotProceedingFile.pilotId
    currentPilotProceedingFile.proceedingFileId = pilotProceedingFile.proceedingFileId
    await currentPilotProceedingFile.save()
    return currentPilotProceedingFile
  }

  async delete(currentPilotProceedingFile: PilotProceedingFile) {
    await currentPilotProceedingFile.delete()
    return currentPilotProceedingFile
  }

  async show(pilotProceedingFileId: number) {
    const pilotProceedingFile = await PilotProceedingFile.query()
      .whereNull('pilot_proceeding_file_deleted_at')
      .where('pilot_proceeding_file_id', pilotProceedingFileId)
      .preload('proceedingFile', async (query) => {
        query.preload('proceedingFileType')
      })
      .first()
    return pilotProceedingFile ? pilotProceedingFile : null
  }

  async index() {
    const pilotProceedingFile = await PilotProceedingFile.query()
      .whereNull('pilot_proceeding_file_deleted_at')
      .orderBy('pilot_proceeding_file_id')
    return pilotProceedingFile ? pilotProceedingFile : []
  }

  async verifyInfoExist(pilotProceedingFile: PilotProceedingFile) {
    const existPilot = await Pilot.query()
      .whereNull('pilot_deleted_at')
      .where('pilot_id', pilotProceedingFile.pilotId)
      .first()

    if (!existPilot && pilotProceedingFile.pilotId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The pilot was not found',
        message: 'The pilot was not found with the entered ID',
        data: { ...pilotProceedingFile },
      }
    }

    const existProceedingFile = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .where('proceeding_file_id', pilotProceedingFile.proceedingFileId)
      .first()

    if (!existProceedingFile && pilotProceedingFile.proceedingFileId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was not found',
        message: 'The proceeding file was not found with the entered ID',
        data: { ...pilotProceedingFile },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...pilotProceedingFile },
    }
  }

  async verifyInfo(pilotProceedingFile: PilotProceedingFile) {
    const action = pilotProceedingFile.pilotProceedingFileId > 0 ? 'updated' : 'created'
    const existPilotProceedingFile = await PilotProceedingFile.query()
      .whereNull('pilot_proceeding_file_deleted_at')
      .if(pilotProceedingFile.pilotProceedingFileId > 0, (query) => {
        query.whereNot('pilot_proceeding_file_id', pilotProceedingFile.pilotProceedingFileId)
      })
      .where('pilot_id', pilotProceedingFile.pilotId)
      .where('proceeding_file_id', pilotProceedingFile.proceedingFileId)
      .first()
    if (existPilotProceedingFile) {
      return {
        status: 400,
        type: 'warning',
        title: 'The relation pilot-proceedingfile already exists',
        message: `The relation pilot-proceedingfile resource cannot be ${action} because the relation is already assigned`,
        data: { ...pilotProceedingFile },
      }
    }
    const existEmployeeProceedingFile = await EmployeeProceedingFile.query()
      .whereNull('employee_proceeding_file_deleted_at')
      .where('proceeding_file_id', pilotProceedingFile.proceedingFileId)
      .first()
    if (existEmployeeProceedingFile) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was assigned in employee proceeding files',
        message: `The relation pilot-proceedingfile resource cannot be ${action} because the proceeding file id was assigned in employee proceeding files`,
        data: { ...pilotProceedingFile },
      }
    }
    const existFlightAttendantProceedingFile = await FlightAttendantProceedingFile.query()
      .whereNull('flight_attendant_proceeding_file_deleted_at')
      .where('proceeding_file_id', pilotProceedingFile.proceedingFileId)
      .first()
    if (existFlightAttendantProceedingFile) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was assigned in flight attendant proceeding files',
        message: `The relation pilot proceeding file resource cannot be ${action} because the proceeding file id was assigned in flight attendant proceeding files`,
        data: { ...pilotProceedingFile },
      }
    }
    const existCustomerProceedingFile = await CustomerProceedingFile.query()
      .whereNull('customer_proceeding_file_deleted_at')
      .where('proceeding_file_id', pilotProceedingFile.proceedingFileId)
      .first()
    if (existCustomerProceedingFile) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was assigned in customer proceeding files',
        message: `The relation pilot proceeding file resource cannot be ${action} because the proceeding file id was assigned in customer proceeding files`,
        data: { ...pilotProceedingFile },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...pilotProceedingFile },
    }
  }

  async getExpiredAndExpiring(filters: PilotProceedingFileFilterInterface) {
    const proceedingFileTypes = await ProceedingFileType.query()
      .whereNull('proceeding_file_type_deleted_at')
      .where('proceeding_file_type_area_to_use', 'pilot')
      .orderBy('proceeding_file_type_id')
      .select('proceeding_file_type_id')

    const proceedingFileTypesIds = proceedingFileTypes.map((item) => item.proceedingFileTypeId)
    const proceedingFilesExpired = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .whereIn('proceeding_file_type_id', proceedingFileTypesIds)
      .whereBetween('proceeding_file_expiration_at', [filters.dateStart, filters.dateEnd])
      .preload('proceedingFileType')
      .preload('pilotProceedingFile')
      .orderBy('proceeding_file_expiration_at')

    const newDateStart = DateTime.fromISO(filters.dateEnd).plus({ days: 1 }).toFormat('yyyy-MM-dd')
    const newDateEnd = DateTime.fromISO(filters.dateEnd).plus({ days: 30 }).toFormat('yyyy-MM-dd')
    const proceedingFilesExpiring = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .whereIn('proceeding_file_type_id', proceedingFileTypesIds)
      .whereBetween('proceeding_file_expiration_at', [newDateStart, newDateEnd])
      .preload('proceedingFileType')
      .preload('pilotProceedingFile')
      .orderBy('proceeding_file_expiration_at')

    return {
      proceedingFilesExpired: proceedingFilesExpired ? proceedingFilesExpired : [],
      proceedingFilesExpiring: proceedingFilesExpiring ? proceedingFilesExpiring : [],
    }
  }
}
