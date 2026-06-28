import type {
  InactivePersonActiveUserResponse,
  InactivePersonActiveUserResponsePersonStatusEnum,
} from '@durion-sdk/people';

/**
 * A single identity-compliance finding: an ACTIVE user-person link whose linked
 * person is in an inactive status (SUSPENDED, TERMINATED, DISABLED). See issue #64.
 */
export type IdentityComplianceFinding = InactivePersonActiveUserResponse;

export type PersonStatus = InactivePersonActiveUserResponsePersonStatusEnum;
