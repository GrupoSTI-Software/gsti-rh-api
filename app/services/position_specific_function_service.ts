import PositionSpecificFunction from '#models/position_specific_function'

export default class PositionSpecificFunctionService {
  async create(positionSpecificFunction: PositionSpecificFunction) {
    const newPositionSpecificFunction = new PositionSpecificFunction()
    newPositionSpecificFunction.positionId = positionSpecificFunction.positionId
    newPositionSpecificFunction.positionSpecificFunctionName = positionSpecificFunction.positionSpecificFunctionName
    newPositionSpecificFunction.positionSpecificFunctionType = positionSpecificFunction.positionSpecificFunctionType
    await newPositionSpecificFunction.save()
    return newPositionSpecificFunction
  }

  async update(currentPositionSpecificFunction: PositionSpecificFunction, positionSpecificFunction: PositionSpecificFunction) {
    currentPositionSpecificFunction.positionSpecificFunctionName = positionSpecificFunction.positionSpecificFunctionName
    currentPositionSpecificFunction.positionSpecificFunctionType = positionSpecificFunction.positionSpecificFunctionType
    await currentPositionSpecificFunction.save()
    return currentPositionSpecificFunction
  }

  async delete(currentPositionSpecificFunction: PositionSpecificFunction) {
    await currentPositionSpecificFunction.delete()
    return currentPositionSpecificFunction
  }

}
