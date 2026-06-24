import type { RetentionPolicyErrorCode } from '../constants/retention_policy_error_codes.js'

export class RetentionPolicyServiceError extends Error {
  readonly errorCode: RetentionPolicyErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string
  readonly messageKey?: string

  constructor(
    message: string,
    errorCode: RetentionPolicyErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string,
    messageKey?: string
  ) {
    super(message)
    this.name = 'RetentionPolicyServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
    this.messageKey = messageKey
  }

  static withMessageKey(
    messageKey: string,
    errorCode: RetentionPolicyErrorCode,
    httpStatus: number,
    key?: string
  ): RetentionPolicyServiceError {
    return new RetentionPolicyServiceError(
      messageKey,
      errorCode,
      httpStatus,
      key,
      undefined,
      messageKey
    )
  }
}
