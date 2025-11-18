import { HttpContext } from '@adonisjs/core/http'

export class StandardResponseFormatter {
  /**
   * Format successful response with pagination
   */
  static success(
    response: HttpContext['response'],
    data: any,
    title: string,
    message: string,
    statusCode: number = 200
  ) {
    // If data has pagination (from Lucid paginate)
    if (data && data.meta && data.data) {
      return response.status(statusCode).json({
        type: 'success',
        title,
        message,
        data: {
          [this.getDataKey(title)]: {
            meta: {
              total: data.meta.total,
              perPage: data.meta.perPage,
              currentPage: data.meta.currentPage,
              lastPage: data.meta.lastPage,
              firstPage: 1,
              firstPageUrl: '/?page=1',
              lastPageUrl: '/?page=${data.meta.lastPage}',
              nextPageUrl: data.meta.currentPage < data.meta.lastPage ? '/?page=${data.meta.currentPage + 1}' : null,
              previousPageUrl: data.meta.currentPage > 1 ? '/?page=${data.meta.currentPage - 1}' : null
            },
            data: data.data
          }
        }
      })
    }

    // If data is a single object or array without pagination
    return response.status(statusCode).json({
      type: 'success',
      title,
      message,
      data: {
        [this.getDataKey(title)]: data
      }
    })
  }

  /**
   * Format error response
   */
  static error(
    response: HttpContext['response'],
    message: string,
    statusCode: number = 400
  ) {
    return response.status(statusCode).json({
      type: 'error',
      title: 'Error',
      message,
      data: null
    })
  }

  /**
   * Get the appropriate data key based on title
   */
  private static getDataKey(title: string): string {
    const keyMap: { [key: string]: string } = {
      'Supply Types': 'supplyTypes',
      'Supply Characteristics': 'supplieCharacteristics',
      'Supply Characteristic Values': 'supplieCaracteristicValues',
      'Supplies': 'supplies',
      'Employee Supplies': 'employeeSupplies',
      'Supply Type': 'supplyType',
      'Supply Characteristic': 'supplieCaracteristic',
      'Supply Characteristic Value': 'supplieCaracteristicValue',
      'Supply': 'supplie',
      'Employee Supply': 'employeeSupply'
    }

    return keyMap[title] || title.toLowerCase().replace(/\s+/g, '')
  }
}
