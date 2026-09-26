import type {
  BranchOfficeOptionDto,
  BranchOfficeScopeDto,
  EmployeeContextDto,
  TabulatedRoundRefDto,
} from './dto/nom035_disclosure.dto.js'

export interface Nom035DisclosureRepository {
  findEmployeeContextByPerson(
    personId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeContextDto | null>

  findBranchOfficeInScope(
    branchOfficeId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<BranchOfficeScopeDto | null>

  listBranchOfficesInScope(allowedBusinessUnitIds: number[]): Promise<BranchOfficeOptionDto[]>

  findLatestTabulatedRound(
    branchOfficeId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<TabulatedRoundRefDto | null>
}
