import { test } from '@japa/runner'
import ExceptionType from '#models/exception_type'
import ExceptionRequest from '#models/exception_request'
import Employee from '#models/employee'
import User from '#models/user'
import {
  VACATION_EXCEPTION_TYPE_SLUG,
  isVacationExceptionTypeSlug,
  exceptionTypeIdIsVacation,
  shiftExceptionTouchesVacation,
  exceptionRequestAcceptTouchesVacation,
} from '#helpers/shift_exception_touches_vacation'

test.group('shiftExceptionTouchesVacation helpers', () => {
  test('isVacationExceptionTypeSlug solo acepta vacation', ({ assert }) => {
    assert.isTrue(isVacationExceptionTypeSlug(VACATION_EXCEPTION_TYPE_SLUG))
    assert.isFalse(isVacationExceptionTypeSlug('absence-from-work'))
    assert.isFalse(isVacationExceptionTypeSlug(null))
    assert.isFalse(isVacationExceptionTypeSlug(undefined))
  })

  test('exceptionTypeIdIsVacation resuelve por slug en catálogo', async ({ assert }) => {
    const vacation = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .firstOrFail()
    const other = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .whereNot('exception_type_slug', 'vacation')
      .firstOrFail()

    assert.isTrue(await exceptionTypeIdIsVacation(vacation.exceptionTypeId))
    assert.isFalse(await exceptionTypeIdIsVacation(other.exceptionTypeId))
    assert.isFalse(await exceptionTypeIdIsVacation(0))
    assert.isFalse(await exceptionTypeIdIsVacation(null))
  })

  test('shiftExceptionTouchesVacation: común→común false; cualquier lado vacation true', async ({
    assert,
  }) => {
    const vacation = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .firstOrFail()
    const other = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .whereNot('exception_type_slug', 'vacation')
      .firstOrFail()

    assert.isFalse(
      await shiftExceptionTouchesVacation({
        currentExceptionTypeId: other.exceptionTypeId,
        nextExceptionTypeId: other.exceptionTypeId,
      })
    )
    assert.isTrue(
      await shiftExceptionTouchesVacation({
        currentExceptionTypeId: other.exceptionTypeId,
        nextExceptionTypeId: vacation.exceptionTypeId,
      })
    )
    assert.isTrue(
      await shiftExceptionTouchesVacation({
        currentExceptionTypeId: vacation.exceptionTypeId,
        nextExceptionTypeId: other.exceptionTypeId,
      })
    )
    assert.isTrue(
      await shiftExceptionTouchesVacation({
        currentExceptionTypeId: vacation.exceptionTypeId,
        nextExceptionTypeId: vacation.exceptionTypeId,
      })
    )
    assert.isTrue(
      await shiftExceptionTouchesVacation({ nextExceptionTypeId: vacation.exceptionTypeId })
    )
  })

  test('exceptionRequestAcceptTouchesVacation solo en accepted + tipo vacation', async ({
    assert,
  }) => {
    const vacation = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .firstOrFail()
    const other = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .whereNot('exception_type_slug', 'vacation')
      .firstOrFail()
    const employee = await Employee.query().whereNull('employee_deleted_at').firstOrFail()
    const user = await User.query().whereNull('user_deleted_at').firstOrFail()

    const vacationReq = await ExceptionRequest.create({
      employeeId: employee.employeeId,
      exceptionTypeId: vacation.exceptionTypeId,
      exceptionRequestStatus: 'pending',
      exceptionRequestDescription: 'test-vacation-gate',
      exceptionRequestCheckInTime: null,
      exceptionRequestCheckOutTime: null,
      exceptionRequestPeriodInHours: null,
      requestedDate: new Date(),
      exceptionRequestRhRead: 0,
      exceptionRequestGerencialRead: 0,
      userId: user.userId,
    })
    const otherReq = await ExceptionRequest.create({
      employeeId: employee.employeeId,
      exceptionTypeId: other.exceptionTypeId,
      exceptionRequestStatus: 'pending',
      exceptionRequestDescription: 'test-other-gate',
      exceptionRequestCheckInTime: null,
      exceptionRequestCheckOutTime: null,
      exceptionRequestPeriodInHours: null,
      requestedDate: new Date(),
      exceptionRequestRhRead: 0,
      exceptionRequestGerencialRead: 0,
      userId: user.userId,
    })

    try {
      assert.isTrue(
        await exceptionRequestAcceptTouchesVacation(vacationReq.exceptionRequestId, 'accepted')
      )
      assert.isFalse(
        await exceptionRequestAcceptTouchesVacation(vacationReq.exceptionRequestId, 'refused')
      )
      assert.isFalse(
        await exceptionRequestAcceptTouchesVacation(otherReq.exceptionRequestId, 'accepted')
      )
      assert.isFalse(await exceptionRequestAcceptTouchesVacation(0, 'accepted'))
    } finally {
      await vacationReq.delete()
      await otherReq.delete()
    }
  })
})
