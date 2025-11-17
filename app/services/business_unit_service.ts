import BusinessUnit from '#models/business_unit'
import { I18n } from '@adonisjs/i18n'
import { BusinessUnitInterface } from '../interfaces/business_unit_interface.js'
import { ResponseDataInterface } from '../interfaces/response_data_interface.js'

export default class BusinessUnitService {
  /**
   * Fetches and lists business units into the system
   *
   * @returns {Promise<ResponseDataInterface>} - Array of business units.
   *
   * @throws {Error} - Throws an error if there is an issue with the query execution.
   */
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async index(): Promise<ResponseDataInterface> {
    try {
      const businessUnitsQuery = await BusinessUnit.query().where('business_unit_active', 1)

      const businessUnitsRes: BusinessUnitInterface[] = [
        ...businessUnitsQuery,
      ] as unknown as BusinessUnitInterface[]

      return {
        status: 200,
        type: 'success',
        title: this.t('resources'),
        message: this.t('resources_were_found_successfully'),
        data: {
          data: businessUnitsRes,
        },
      }
    } catch (error) {
      throw new Error(error)
    }
  }
}
