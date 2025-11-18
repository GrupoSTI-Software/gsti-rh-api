import EmployeeSuppliesResponseContract from '#models/employee_supplies_response_contract'
import EmployeeSupplie from '#models/employee_supplie'
import UploadService from './upload_service.js'
import { randomUUID } from 'node:crypto'

export default class EmployeeSuppliesResponseContractService {
  /**
   * Upload contract file and create records for multiple employee supplies
   */
  static async uploadContract(data: {
    file: any
    digitalSignature?: any
    employeeSupplyIds: number[]
  }) {
    // Validate that all employee supplies exist
    const employeeSupplies = await EmployeeSupplie.query()
      .whereIn('employeeSupplyId', data.employeeSupplyIds)

    if (employeeSupplies.length !== data.employeeSupplyIds.length) {
      const foundIds = employeeSupplies.map((es) => es.employeeSupplyId)
      const missingIds = data.employeeSupplyIds.filter((id) => !foundIds.includes(id))
      throw new Error(`Employee supplies not found: ${missingIds.join(', ')}`)
    }

    // Generate unique UUID for this contract
    const contractUuid = randomUUID()

    // Upload contract file to S3
    const uploadService = new UploadService()
    const folderName = 'employee-supplies-response-contracts'
    const fileUrl = await uploadService.fileUpload(data.file, folderName)

    if (fileUrl === 'file_not_found' || fileUrl === 'S3Producer.fileUpload') {
      throw new Error('Failed to upload contract file to S3')
    }

    // Upload digital signature to S3 if provided
    let digitalSignatureUrl: string | null = null
    if (data.digitalSignature) {
      const signatureFolderName = 'employee-supplies-response-contracts/signatures'
      digitalSignatureUrl = await uploadService.fileUpload(data.digitalSignature, signatureFolderName)

      if (digitalSignatureUrl === 'file_not_found' || digitalSignatureUrl === 'S3Producer.fileUpload') {
        throw new Error('Failed to upload digital signature file to S3')
      }
    }

    // Create records for each employee supply
    const contracts = []
    for (const employeeSupplyId of data.employeeSupplyIds) {
      const contract = await EmployeeSuppliesResponseContract.create({
        employeeSupplyId,
        employeeSupplyResponseContractUuid: contractUuid,
        employeeSupplyResponseContractFile: fileUrl,
        employeeSupplyResponseContractDigitalSignature: digitalSignatureUrl,
      })
      contracts.push(contract)
    }

    return {
      contractUuid,
      fileUrl,
      digitalSignatureUrl,
      contracts,
    }
  }

  /**
   * Get all contracts with pagination and filters
   */
  static async getAll(filters: {
    page?: number
    limit?: number
    employeeSupplyId?: number
    contractUuid?: string
  }) {
    const page = filters.page || 1
    const limit = filters.limit || 10

    const query = EmployeeSuppliesResponseContract.query()
      .preload('employeeSupply', (employeeSupplyQuery) => {
        employeeSupplyQuery.preload('employee', (employeeQuery) => {
          employeeQuery.preload('person')
        })
        employeeSupplyQuery.preload('supply', (supplyQuery) => {
          supplyQuery.preload('supplyType')
        })
      })

    if (filters.employeeSupplyId) {
      query.where('employeeSupplyId', filters.employeeSupplyId)
    }

    if (filters.contractUuid) {
      query.where('employeeSupplyResponseContractUuid', filters.contractUuid)
    }

    return await query.paginate(page, limit)
  }

  /**
   * Get contract by ID
   */
  static async getById(id: number) {
    return await EmployeeSuppliesResponseContract.query()
      .where('employeeSupplyResponseContractId', id)
      .preload('employeeSupply', (employeeSupplyQuery) => {
        employeeSupplyQuery.preload('employee', (employeeQuery) => {
          employeeQuery.preload('person')
        })
        employeeSupplyQuery.preload('supply', (supplyQuery) => {
          supplyQuery.preload('supplyType')
        })
      })
      .firstOrFail()
  }

  /**
   * Get contracts by UUID (all contracts with the same UUID)
   */
  static async getByUuid(uuid: string) {
    return await EmployeeSuppliesResponseContract.query()
      .where('employeeSupplyResponseContractUuid', uuid)
      .preload('employeeSupply', (employeeSupplyQuery) => {
        employeeSupplyQuery.preload('employee', (employeeQuery) => {
          employeeQuery.preload('person')
        })
        employeeSupplyQuery.preload('supply', (supplyQuery) => {
          supplyQuery.preload('supplyType')
        })
      })
  }

  /**
   * Delete contract (soft delete)
   */
  static async delete(id: number) {
    const contract = await EmployeeSuppliesResponseContract.findOrFail(id)
    await contract.delete()
    return contract
  }
}

