import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { APPaymentsService } from '@durion-sdk/accounting';
import { BulkLoadFileUploadAPIService } from '@durion-sdk/bulk-loader';
import { CatalogAPIService } from '@durion-sdk/catalog';
import { CRMAccountsService } from '@durion-sdk/customer';
import { ASNService } from '@durion-sdk/inventory';
import { BillingAuthorizationService } from '@durion-sdk/invoice';
import { BayAPIService } from '@durion-sdk/location';
import { OrderCancellationService } from '@durion-sdk/order';
import { EmployeeAPIService } from '@durion-sdk/people';
import { PeopleAPIService } from '@durion-sdk/people-contact';
import { AdminAccountStateAPIService } from '@durion-sdk/security';
import { AppointmentAssignmentsService } from '@durion-sdk/shop-manager';
import { SupplierAuthConfigsService } from '@durion-sdk/supplier';
import { VehicleAPIService } from '@durion-sdk/vehicle-inventory';
import { ApprovalConfigurationAPIService } from '@durion-sdk/workorder';

import { appConfig } from './app.config';
import { environment } from '../environments/environment';

/**
 * app.config.ts provides each package's Configuration from its `/configuration` entry point, while
 * services are injected from the primary entry (#334). If the two ever resolved to different
 * Configuration classes, the root provider would silently not apply and every call would go to the
 * generator's default host. One generated service per package proves the provider reaches it.
 */
const CASES: [string, abstract new (...args: never[]) => { configuration: { basePath?: string } }][] = [
  ['accounting', APPaymentsService],
  ['bulk-loader', BulkLoadFileUploadAPIService],
  ['catalog', CatalogAPIService],
  ['customer', CRMAccountsService],
  ['inventory', ASNService],
  ['invoice', BillingAuthorizationService],
  ['location', BayAPIService],
  ['order', OrderCancellationService],
  ['people', EmployeeAPIService],
  ['people-contact', PeopleAPIService],
  ['security-service', AdminAccountStateAPIService],
  ['shop-manager', AppointmentAssignmentsService],
  ['supplier', SupplierAuthConfigsService],
  ['vehicle-inventory', VehicleAPIService],
  ['workorder', ApprovalConfigurationAPIService],
];

describe('appConfig SDK Configuration providers (#334)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
  });

  it.each(CASES)('points %s services at the gateway', (module, service) => {
    const instance = TestBed.inject(service as never) as { configuration: { basePath?: string } };
    expect(instance.configuration.basePath).toBe(`${environment.apiBaseUrl}/${module}`);
  });
});
