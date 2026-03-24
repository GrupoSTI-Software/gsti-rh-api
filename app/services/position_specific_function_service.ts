import PositionSpecificFunction from '#models/position_specific_function'

export default class PositionSpecificFunctionService {
  async create(positionSpecificFunction: PositionSpecificFunction) {
    const newPositionSpecificFunction = new PositionSpecificFunction()
    newPositionSpecificFunction.positionId = positionSpecificFunction.positionId
    newPositionSpecificFunction.positionSpecificFunctionName = positionSpecificFunction.positionSpecificFunctionName
    newPositionSpecificFunction.positionSpecificFunctionFrequency = positionSpecificFunction.positionSpecificFunctionFrequency
    await newPositionSpecificFunction.save()
    return newPositionSpecificFunction
  }

  async update(currentPositionSpecificFunction: PositionSpecificFunction, positionSpecificFunction: PositionSpecificFunction) {
    currentPositionSpecificFunction.positionSpecificFunctionName = positionSpecificFunction.positionSpecificFunctionName
    currentPositionSpecificFunction.positionSpecificFunctionFrequency = positionSpecificFunction.positionSpecificFunctionFrequency
    await currentPositionSpecificFunction.save()
    return currentPositionSpecificFunction
  }

  async delete(currentPositionSpecificFunction: PositionSpecificFunction) {
    await currentPositionSpecificFunction.delete()
    return currentPositionSpecificFunction
  }

  async getDistinctNames() {
    const positionSpecificFunctionNames = await PositionSpecificFunction.query()
      .whereNull('position_specific_function_deleted_at')
      .select('position_specific_function_name')
      .distinct('position_specific_function_name')
      .orderBy('position_specific_function_name')
    return positionSpecificFunctionNames
  }

  async getDistinctFrequencies() {
    const positionSpecificFunctionFrequencies = await PositionSpecificFunction.query()
      .whereNull('position_specific_function_deleted_at')
      .select('position_specific_function_frequency')
      .distinct('position_specific_function_frequency')
      .orderBy('position_specific_function_frequency')
    return positionSpecificFunctionFrequencies
  }

  async getByPosition(positionId: number) {
    const positionSpecificFunctions = await PositionSpecificFunction.query()
      .whereNull('position_specific_function_deleted_at')
      .where('position_id', positionId)
      .orderBy('position_specific_function_name')
    return positionSpecificFunctions
  }

}
