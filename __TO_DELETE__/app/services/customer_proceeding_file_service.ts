import EmployeeProceedingFile from '#models/employee_proceeding_file'
import FlightAttendantProceedingFile from '#models/flight_attendant_proceeding_file'
import Customer from '#models/customer'
import CustomerProceedingFile from '#models/customer_proceeding_file'
import ProceedingFile from '#models/proceeding_file'
import PilotProceedingFile from '#models/pilot_proceeding_file'
import ProceedingFileType from '#models/proceeding_file_type'
import { CustomerProceedingFileFilterInterface } from '../interfaces/customer_proceeding_file_filter_interface.js'
import { DateTime } from 'luxon'
import { I18n } from '@adonisjs/i18n'

export default class CustomerProceedingFileService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async create(customerProceedingFile: CustomerProceedingFile) {
    const newCustomerProceedingFile = new CustomerProceedingFile()
    newCustomerProceedingFile.customerId = customerProceedingFile.customerId
    newCustomerProceedingFile.proceedingFileId = customerProceedingFile.proceedingFileId
    await newCustomerProceedingFile.save()
    return newCustomerProceedingFile
  }

  async update(
    currentCustomerProceedingFile: CustomerProceedingFile,
    customerProceedingFile: CustomerProceedingFile
  ) {
    currentCustomerProceedingFile.customerId = customerProceedingFile.customerId
    currentCustomerProceedingFile.proceedingFileId = customerProceedingFile.proceedingFileId
    await currentCustomerProceedingFile.save()
    return currentCustomerProceedingFile
  }

  async delete(currentCustomerProceedingFile: CustomerProceedingFile) {
    await currentCustomerProceedingFile.delete()
    return currentCustomerProceedingFile
  }

  async show(customerProceedingFileId: number) {
    const customerProceedingFile = await CustomerProceedingFile.query()
      .whereNull('customer_proceeding_file_deleted_at')
      .where('customer_proceeding_file_id', customerProceedingFileId)
      .preload('proceedingFile', async (query) => {
        query.preload('proceedingFileType')
      })
      .first()
    return customerProceedingFile ? customerProceedingFile : null
  }

  async index() {
    const customerProceedingFile = await CustomerProceedingFile.query()
      .whereNull('customer_proceeding_file_deleted_at')
      .orderBy('customer_proceeding_file_id')
    return customerProceedingFile ? customerProceedingFile : []
  }

  async verifyInfoExist(customerProceedingFile: CustomerProceedingFile) {
    const existCustomer = await Customer.query()
      .whereNull('customer_deleted_at')
      .where('customer_id', customerProceedingFile.customerId)
      .first()

    if (!existCustomer && customerProceedingFile.customerId) {
      const entity = this.t('customer')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...customerProceedingFile },
      }
    }

    const existProceedingFile = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .where('proceeding_file_id', customerProceedingFile.proceedingFileId)
      .first()

    if (!existProceedingFile && customerProceedingFile.proceedingFileId) {
      const entity = this.t('proceeding_file')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...customerProceedingFile },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...customerProceedingFile },
    }
  }

  async verifyInfo(customerProceedingFile: CustomerProceedingFile) {
    const action = customerProceedingFile.customerProceedingFileId > 0 ? 'updated' : 'created'
    const existCustomerProceedingFile = await CustomerProceedingFile.query()
      .whereNull('customer_proceeding_file_deleted_at')
      .if(customerProceedingFile.customerProceedingFileId > 0, (query) => {
        query.whereNot(
          'customer_proceeding_file_id',
          customerProceedingFile.customerProceedingFileId
        )
      })
      .where('customer_id', customerProceedingFile.customerId)
      .where('proceeding_file_id', customerProceedingFile.proceedingFileId)
      .first()
    if (existCustomerProceedingFile) {
      const entity = `${this.t('relation')} ${this.t('customer')} - ${this.t('proceeding_files')}`
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_value_of_entity_already_exists_for_another_register', { entity  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_relation_is_already_assigned_to_another_register')}`,
        data: { ...customerProceedingFile },
      }
    }
    const existPilotProceedingFile = await PilotProceedingFile.query()
      .whereNull('pilot_proceeding_file_deleted_at')
      .where('proceeding_file_id', customerProceedingFile.proceedingFileId)
      .first()
    if (existPilotProceedingFile) {
      const entity = `${this.t('relation')} ${this.t('customer')} - ${this.t('proceeding_files')}`
      const param = this.t('proceeding_file')
      const table = `${this.t('relation')} ${this.t('pilot')} - ${this.t('proceeding_files')}`
      return {
        status: 400,
        type: 'warning',
        title: this.t('param_was_already_assigned_in_entity', { entity: table, param  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_param_was_already_assigned_in_entity', { entity: table,  param })}`,
        data: { ...customerProceedingFile },
      }
    }
    const existEmployeeProceedingFile = await EmployeeProceedingFile.query()
      .whereNull('employee_proceeding_file_deleted_at')
      .where('proceeding_file_id', customerProceedingFile.proceedingFileId)
      .first()
    if (existEmployeeProceedingFile) {
      const entity = `${this.t('relation')} ${this.t('customer')} - ${this.t('proceeding_files')}`
      const param = this.t('proceeding_file')
      const table = `${this.t('relation')} ${this.t('employee')} - ${this.t('proceeding_files')}`
      return {
        status: 400,
        type: 'warning',
        title: this.t('param_was_already_assigned_in_entity', { entity: table, param  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_param_was_already_assigned_in_entity', { entity: table,  param })}`,
        data: { ...customerProceedingFile },
      }
    }
    const existFlightAttendantProceedingFile = await FlightAttendantProceedingFile.query()
      .whereNull('flight_attendant_proceeding_file_deleted_at')
      .where('proceeding_file_id', customerProceedingFile.proceedingFileId)
      .first()
    if (existFlightAttendantProceedingFile) {
      const entity = `${this.t('relation')} ${this.t('customer')} - ${this.t('proceeding_files')}`
      const param = this.t('proceeding_file')
      const table = `${this.t('relation')} ${this.t('flight_attendant')} - ${this.t('proceeding_files')}`
      return {
        status: 400,
        type: 'warning',
        title: this.t('param_was_already_assigned_in_entity', { entity: table, param  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_param_was_already_assigned_in_entity', { entity: table,  param })}`,
        data: { ...customerProceedingFile },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...customerProceedingFile },
    }
  }

  async getExpiredAndExpiring(filters: CustomerProceedingFileFilterInterface) {
    const proceedingFileTypes = await ProceedingFileType.query()
      .whereNull('proceeding_file_type_deleted_at')
      .where('proceeding_file_type_area_to_use', 'customer')
      .orderBy('proceeding_file_type_id')
      .select('proceeding_file_type_id')

    const proceedingFileTypesIds = proceedingFileTypes.map((item) => item.proceedingFileTypeId)
    const proceedingFilesExpired = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .whereIn('proceeding_file_type_id', proceedingFileTypesIds)
      .whereBetween('proceeding_file_expiration_at', [filters.dateStart, filters.dateEnd])
      .preload('proceedingFileType')
      .preload('customerProceedingFile')
      .orderBy('proceeding_file_expiration_at')

    const newDateStart = DateTime.fromISO(filters.dateEnd).plus({ days: 1 }).toFormat('yyyy-MM-dd')
    const newDateEnd = DateTime.fromISO(filters.dateEnd).plus({ days: 30 }).toFormat('yyyy-MM-dd')
    const proceedingFilesExpiring = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .whereIn('proceeding_file_type_id', proceedingFileTypesIds)
      .whereBetween('proceeding_file_expiration_at', [newDateStart, newDateEnd])
      .preload('proceedingFileType')
      .preload('customerProceedingFile')
      .orderBy('proceeding_file_expiration_at')

    return {
      proceedingFilesExpired: proceedingFilesExpired ? proceedingFilesExpired : [],
      proceedingFilesExpiring: proceedingFilesExpiring ? proceedingFilesExpiring : [],
    }
  }
}
