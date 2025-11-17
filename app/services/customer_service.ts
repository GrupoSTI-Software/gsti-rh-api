import Customer from '#models/customer'
import Person from '#models/person'
import { CustomerFilterSearchInterface } from '../interfaces/customer_filter_search_interface.js'
import Employee from '#models/employee'
import CustomerProceedingFile from '#models/customer_proceeding_file'
import { I18n } from '@adonisjs/i18n'

export default class CustomerService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async index(filters: CustomerFilterSearchInterface) {
    const customers = await Customer.query()
      .whereNull('customer_deleted_at')
      .if(filters.search, (query) => {
        query.where((subQuery) => {
          subQuery.whereRaw('UPPER(customer_uuid) LIKE ?', [`%${filters.search.toUpperCase()}%`])
          subQuery.orWhereHas('person', (personQuery) => {
            personQuery.whereRaw('UPPER(person_rfc) LIKE ?', [`%${filters.search.toUpperCase()}%`])
            personQuery.orWhereRaw('UPPER(person_curp) LIKE ?', [
              `%${filters.search.toUpperCase()}%`,
            ])
            personQuery.orWhereRaw('UPPER(person_imss_nss) LIKE ?', [
              `%${filters.search.toUpperCase()}%`,
            ])
            personQuery.orWhereRaw(
              'UPPER(CONCAT(person_firstname, " ", person_lastname, " ", person_second_lastname)) LIKE ?',
              [`%${filters.search.toUpperCase()}%`]
            )
          })
        })
      })
      .preload('person')
      .orderBy('customer_id')
      .paginate(filters.page, filters.limit)
    return customers
  }

  async create(customer: Customer) {
    const newCustomer = new Customer()
    newCustomer.personId = await customer.personId
    newCustomer.customerUuid = customer.customerUuid
    await newCustomer.save()
    return newCustomer
  }

  async update(currentCustomer: Customer, customer: Customer) {
    currentCustomer.customerUuid = customer.customerUuid
    await currentCustomer.save()
    return currentCustomer
  }

  async delete(currentCustomer: Customer) {
    await currentCustomer.delete()
    return currentCustomer
  }

  async show(customerId: number) {
    const customer = await Customer.query()
      .whereNull('customer_deleted_at')
      .where('customer_id', customerId)
      .preload('person')
      .first()
    return customer ? customer : null
  }

  async verifyInfoExist(customer: Customer) {
    if (!customer.customerId) {
      const existPerson = await Person.query()
        .whereNull('person_deleted_at')
        .where('person_id', customer.personId)
        .first()

      if (!existPerson && customer.personId) {
        const entity = this.t('person')
        return {
          status: 400,
          type: 'warning',
          title: this.t('entity_was_not_found', { entity }),
          message: this.t('entity_was_not_found_with_entered_id', { entity }),
          data: { ...customer },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...customer },
    }
  }

  async getProceedingFiles(employeeId: number) {
    const proceedingFiles = await CustomerProceedingFile.query()
      .whereNull('customer_proceeding_file_deleted_at')
      .where('customer_id', employeeId)
      .preload('proceedingFile', (query) => {
        query.preload('proceedingFileType')
      })
      .orderBy('customer_id')
    return proceedingFiles ? proceedingFiles : []
  }

  async verifyInfo(customer: Customer) {
    const action = customer.customerId > 0 ? 'updated' : 'created'
    const existUuid = await Customer.query()
      .if(customer.customerId > 0, (query) => {
        query.whereNot('customer_id', customer.customerId)
      })
      .whereNull('customer_deleted_at')
      .where('customer_uuid', customer.customerUuid)
      .first()

    if (existUuid && customer.customerUuid) {
      const entity = this.t('customer')
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_value_of_entity_already_exists_for_another_register', { entity: 'UUID'  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_value_of_entity_is_already_assigned_to_another_register', { entity: 'UUID' })}`,
        data: { ...customer },
      }
    }
    if (!customer.customerId) {
      const existPersonId = await Customer.query()
        .if(customer.customerId > 0, (query) => {
          query.whereNot('customer_id', customer.customerId)
        })
        .whereNull('customer_deleted_at')
        .where('person_id', customer.personId)
        .first()

      if (existPersonId && customer.personId) {
        const entity = this.t('customer')
        const param = `${this.t('person')} ID`
        return {
          status: 400,
          type: 'warning',
          title: this.t('the_value_of_entity_already_exists_for_another_register', { entity: param  }),
          message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_value_of_entity_is_already_assigned_to_another_register', { entity: param })}`,
          data: { ...customer },
        }
      }
      const existEmployeePersonId = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('person_id', customer.personId)
        .first()
      if (existEmployeePersonId) {
        const entity = this.t('customer')
        const param = `${this.t('person')} ID`
        return {
          status: 400,
          type: 'warning',
          title: this.t('the_value_of_entity_already_exists_for_another_register', { entity: param  }),
          message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_value_of_entity_is_already_assigned_to_another_register', { entity: param })}`,
          data: { ...customer },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...customer },
    }
  }
}
