import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CustomerListComponent } from './customer-list.component';
import { CrmService } from '../../services/crm.service';

const crmServiceStub = {
  browseParties: vi.fn(),
  searchParties: vi.fn(),
};

describe('CustomerListComponent', () => {
  let fixture: ComponentFixture<CustomerListComponent>;
  let component: CustomerListComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    crmServiceStub.browseParties.mockReturnValue(of({ parties: [] }));
    crmServiceStub.searchParties.mockReturnValue(of({ parties: [] }));

    await TestBed.configureTestingModule({
      imports: [CustomerListComponent],
      providers: [
        provideRouter([]),
        { provide: CrmService, useValue: crmServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerListComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('calls browse API on initial empty query to load customers', () => {
    fixture.detectChanges();

    expect(crmServiceStub.browseParties).toHaveBeenCalled();
    expect(crmServiceStub.searchParties).not.toHaveBeenCalled();
    expect(component.state()).toBe('empty');
    expect(component.error()).toBeNull();
  });

  it('calls search API with trimmed query when searching', () => {
    component.search('  acme  ');

    expect(crmServiceStub.searchParties).toHaveBeenCalledWith('acme');
    expect(crmServiceStub.browseParties).not.toHaveBeenCalled();
  });

  it('returns to browse mode when the query is cleared', () => {
    component.search('acme');
    component.search('   ');

    expect(crmServiceStub.searchParties).toHaveBeenCalledWith('acme');
    expect(crmServiceStub.browseParties).toHaveBeenCalledTimes(1);
  });

  it('surfaces error state when API search fails', () => {
    crmServiceStub.searchParties.mockReturnValueOnce(throwError(() => ({ status: 500 })));

    component.search('acme');

    expect(component.state()).toBe('error');
    expect(component.error()).toBe('Search failed.');
  });
});
