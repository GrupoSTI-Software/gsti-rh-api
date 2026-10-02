import WorkDisabilityPeriod from '#models/work_disability_period'
import WorkDisabilityPeriodExpense from '#models/work_disability_period_expense'

export default class WorkDisabilityPeriodExpenseService {
  async create(workDisabilityPeriodExpense: WorkDisabilityPeriodExpense) {
    const newWorkDisabilityPeriodExpense = new WorkDisabilityPeriodExpense()
    newWorkDisabilityPeriodExpense.workDisabilityPeriodExpenseFile =
      workDisabilityPeriodExpense.workDisabilityPeriodExpenseFile
    newWorkDisabilityPeriodExpense.workDisabilityPeriodExpenseAmount =
      workDisabilityPeriodExpense.workDisabilityPeriodExpenseAmount
    newWorkDisabilityPeriodExpense.workDisabilityPeriodId =
      workDisabilityPeriodExpense.workDisabilityPeriodId
    newWorkDisabilityPeriodExpense.workDisabilityPeriodExpenseConcept =
      workDisabilityPeriodExpense.workDisabilityPeriodExpenseConcept ?? null
    await newWorkDisabilityPeriodExpense.save()
    return newWorkDisabilityPeriodExpense
  }

  async update(
    currentWorkDisabilityPeriodExpense: WorkDisabilityPeriodExpense,
    workDisabilityPeriodExpense: WorkDisabilityPeriodExpense
  ) {
    currentWorkDisabilityPeriodExpense.workDisabilityPeriodExpenseFile =
      workDisabilityPeriodExpense.workDisabilityPeriodExpenseFile
    currentWorkDisabilityPeriodExpense.workDisabilityPeriodExpenseAmount =
      workDisabilityPeriodExpense.workDisabilityPeriodExpenseAmount
    currentWorkDisabilityPeriodExpense.workDisabilityPeriodId =
      workDisabilityPeriodExpense.workDisabilityPeriodId
    // Una edición sin concepto conserva el que ya tenía.
    if (workDisabilityPeriodExpense.workDisabilityPeriodExpenseConcept !== undefined) {
      currentWorkDisabilityPeriodExpense.workDisabilityPeriodExpenseConcept =
        workDisabilityPeriodExpense.workDisabilityPeriodExpenseConcept
    }
    await currentWorkDisabilityPeriodExpense.save()
    return currentWorkDisabilityPeriodExpense
  }

  async delete(currentWorkDisabilityPeriodExpense: WorkDisabilityPeriodExpense) {
    await currentWorkDisabilityPeriodExpense.delete()
    return currentWorkDisabilityPeriodExpense
  }

  async show(workDisabilityPeriodExpenseId: number) {
    const workDisabilityPeriodExpense = await WorkDisabilityPeriodExpense.query()
      .whereNull('work_disability_period_expense_deleted_at')
      .where('work_disability_period_expense_id', workDisabilityPeriodExpenseId)
      .preload('workDisabilityPeriod')
      .first()
    return workDisabilityPeriodExpense ? workDisabilityPeriodExpense : null
  }

  async verifyInfoExist(workDisabilityPeriodExpense: WorkDisabilityPeriodExpense) {
    const existWorkDisabilityPeriod = await WorkDisabilityPeriod.query()
      .whereNull('work_disability_period_deleted_at')
      .where('work_disability_period_id', workDisabilityPeriodExpense.workDisabilityPeriodId)
      .first()

    if (!existWorkDisabilityPeriod && workDisabilityPeriodExpense.workDisabilityPeriodId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The work disability period was not found',
        message: 'The work disability period was not found with the entered ID',
        data: { ...workDisabilityPeriodExpense },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...workDisabilityPeriodExpense },
    }
  }
}
