import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { WorkexecService } from '../../services/workexec.service';
import { OperationalCostComponent } from './operational-cost.component';

describe('OperationalCostComponent', () => {
  let fixture: ComponentFixture<OperationalCostComponent>;
  let component: OperationalCostComponent;

  const workexecServiceStub = {
    getWorkorderDetail: vi.fn().mockReturnValue(of({ operationalContext: {} })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OperationalCostComponent, TranslateModule.forRoot()],
      providers: [
        { provide: WorkexecService, useValue: workexecServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OperationalCostComponent);
    component = fixture.componentInstance;
  });

  describe('ngOnInit() with partial inputs', () => {
    it('should use debitTotalInput even when creditTotalInput is null', () => {
      component.debitTotalInput = 100;
      component.creditTotalInput = null;
      component.workorderId = '';
      component.ngOnInit();
      expect(component.debitTotal()).toBe(100);
      expect(component.netTotal()).toBe(100);
    });

    it('should use creditTotalInput even when debitTotalInput is null', () => {
      component.creditTotalInput = 50;
      component.debitTotalInput = null;
      component.workorderId = '';
      component.ngOnInit();
      expect(component.creditTotal()).toBe(50);
      expect(component.netTotal()).toBe(-50);
    });

    it('should not have netTotalInput property', () => {
      expect((component as any).netTotalInput).toBeUndefined();
    });
  });
});
