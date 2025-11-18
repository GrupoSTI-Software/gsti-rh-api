import Employee from '#models/employee'
import EmployeeBank from '#models/employee_bank'
import { I18n } from '@adonisjs/i18n'
import crypto from 'node:crypto'

export default class EmployeeBankService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }
  async create(employeeBank: EmployeeBank) {
    const newEmployeeBank = new EmployeeBank()
    newEmployeeBank.employeeBankAccountClabe = employeeBank.employeeBankAccountClabe
    newEmployeeBank.employeeBankAccountClabeLastNumbers =
      employeeBank.employeeBankAccountClabeLastNumbers
    newEmployeeBank.employeeBankAccountNumber = employeeBank.employeeBankAccountNumber
    newEmployeeBank.employeeBankAccountNumberLastNumbers =
      employeeBank.employeeBankAccountNumberLastNumbers
    newEmployeeBank.employeeBankAccountCardNumber = employeeBank.employeeBankAccountCardNumber
    newEmployeeBank.employeeBankAccountCardNumberLastNumbers =
      employeeBank.employeeBankAccountCardNumberLastNumbers
    newEmployeeBank.employeeBankAccountType = employeeBank.employeeBankAccountType
    newEmployeeBank.employeeBankAccountCurrencyType = employeeBank.employeeBankAccountCurrencyType
    newEmployeeBank.employeeId = employeeBank.employeeId
    newEmployeeBank.bankId = employeeBank.bankId
    await newEmployeeBank.save()
    return newEmployeeBank
  }

  async update(currentEmployeeBank: EmployeeBank, employeeBank: EmployeeBank) {
    currentEmployeeBank.employeeBankAccountClabe = employeeBank.employeeBankAccountClabe
    currentEmployeeBank.employeeBankAccountClabeLastNumbers =
      employeeBank.employeeBankAccountClabeLastNumbers
    currentEmployeeBank.employeeBankAccountNumber = employeeBank.employeeBankAccountNumber
    currentEmployeeBank.employeeBankAccountNumberLastNumbers =
      employeeBank.employeeBankAccountNumberLastNumbers
    currentEmployeeBank.employeeBankAccountCardNumber = employeeBank.employeeBankAccountCardNumber
    currentEmployeeBank.employeeBankAccountCardNumberLastNumbers =
      employeeBank.employeeBankAccountCardNumberLastNumbers
    currentEmployeeBank.employeeBankAccountType = employeeBank.employeeBankAccountType
    currentEmployeeBank.employeeBankAccountCurrencyType =
      employeeBank.employeeBankAccountCurrencyType
    currentEmployeeBank.bankId = employeeBank.bankId
    await currentEmployeeBank.save()
    return currentEmployeeBank
  }

  async delete(currentEmployeeBank: EmployeeBank) {
    await currentEmployeeBank.delete()
    return currentEmployeeBank
  }

  async show(employeeBankId: number) {
    const employeeBank = await EmployeeBank.query()
      .whereNull('employee_bank_deleted_at')
      .where('employee_bank_id', employeeBankId)
      .preload('bank')
      .first()
    return employeeBank ? employeeBank : null
  }

  async verifyInfoExist(employeeBank: EmployeeBank) {
    const existEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeBank.employeeId)
      .first()

    if (!existEmployee && employeeBank.employeeId) {
      const entity = this.t('employee')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeBank },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...employeeBank },
    }
  }

  encrypt(value: string, secretKey: string): string {
    if (!value) {
      return ''
    }
    // Generate a random initialization vector (IV)
    const iv = crypto.randomBytes(16)

    // Create the cipher using AES-256-CTR
    const cipher = crypto.createCipheriv('aes-256-ctr', Buffer.from(secretKey, 'utf-8'), iv)

    // Perform the encryption
    let encrypted = cipher.update(value, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    // Return the IV along with the encrypted value so it can be decrypted later
    return `${iv.toString('hex')}:${encrypted}`
  }
}
