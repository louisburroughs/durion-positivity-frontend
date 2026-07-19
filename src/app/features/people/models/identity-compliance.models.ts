import type {
  InactivePersonActiveUserResponse,
  InactivePersonActiveUserResponsePersonStatusEnum,
} from '@durion-sdk/people';

/**
 * A single identity-compliance finding: an ACTIVE user-person link whose linked
 * person is in an inactive status (SUSPENDED, TERMINATED, DISABLED). See issue #64.
 *
 * Restored against the pos-people compliance report (issue #177): link facts come
 * from the people-contact replica, so findings can trail the link authority by the
 * event-propagation delay.
 */
export type IdentityComplianceFinding = InactivePersonActiveUserResponse;

export type PersonStatus = InactivePersonActiveUserResponsePersonStatusEnum;
