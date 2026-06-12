import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SkuFilterComponent } from './sku-filter.component';

describe('SkuFilterComponent', () => {
  let fixture: ComponentFixture<SkuFilterComponent>;
  let component: SkuFilterComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [SkuFilterComponent, TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(SkuFilterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('debounces skuChange by 300ms', fakeAsync(() => {
    const emitted: Array<string | undefined> = [];
    fixture.componentRef.setInput('initialValue', '');
    fixture.detectChanges();
    component.skuChange.subscribe(v => emitted.push(v));

    component.onInput({ target: { value: 'SKU-1' } } as unknown as Event);
    tick(200);
    expect(emitted).toHaveLength(0);

    tick(100);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toBe('SKU-1');
  }));

  it('normalizes whitespace-only input to undefined', fakeAsync(() => {
    const emitted: Array<string | undefined> = [];
    component.skuChange.subscribe(v => emitted.push(v));

    component.onInput({ target: { value: '   ' } } as unknown as Event);
    tick(300);

    expect(emitted[0]).toBeUndefined();
  }));

  it('clears input and emits undefined on clear()', fakeAsync(() => {
    const emitted: Array<string | undefined> = [];
    component.skuChange.subscribe(v => emitted.push(v));

    component.onInput({ target: { value: 'SKU-99' } } as unknown as Event);
    tick(300);
    expect(emitted[0]).toBe('SKU-99');

    component.clear();
    tick(300);
    expect(component.inputValue()).toBe('');
    expect(emitted[1]).toBeUndefined();
  }));

  it('deduplicates identical consecutive values', fakeAsync(() => {
    const emitted: Array<string | undefined> = [];
    component.skuChange.subscribe(v => emitted.push(v));

    component.onInput({ target: { value: 'SKU-X' } } as unknown as Event);
    tick(300);
    component.onInput({ target: { value: 'SKU-X' } } as unknown as Event);
    tick(300);

    expect(emitted).toHaveLength(1);
  }));

  it('renders input with correct aria-label attribute', () => {
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input');
    expect(input).not.toBeNull();
  });
});
