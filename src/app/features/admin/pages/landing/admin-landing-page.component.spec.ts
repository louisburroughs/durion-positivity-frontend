import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AdminLandingPageComponent } from './admin-landing-page.component';

describe('AdminLandingPageComponent', () => {
  let fixture: ComponentFixture<AdminLandingPageComponent>;
  let component: AdminLandingPageComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('exposes the admin landing config with the correct title key', () => {
    expect(component.config.titleKey).toBe('ADMIN.LANDING.TITLE');
    expect(component.config.eyebrowKey).toBe('SHELL.NAV.ADMIN');
  });

  it('declares four sections', () => {
    expect(component.config.sections.length).toBe(4);
  });

  it('only the roles section carries a record kind', () => {
    const withRecordKind = component.config.sections.filter(s => s.recordKind);
    expect(withRecordKind.length).toBe(1);
    expect(withRecordKind[0].recordKind).toBe('role');
  });

  it('has sane card kinds: 6 direct, 1 guided', () => {
    const cards = component.config.sections.flatMap(s => s.cards);
    const direct = cards.filter(c => c.kind === 'direct');
    const guided = cards.filter(c => c.kind === 'guided');
    expect(direct.length).toBe(6);
    expect(guided.length).toBe(1);
  });

  it('every direct card has a route and every guided card builds commands', () => {
    for (const section of component.config.sections) {
      for (const card of section.cards) {
        if (card.kind === 'direct') {
          expect(card.route).toBeTruthy();
        } else {
          expect(typeof card.buildCommands).toBe('function');
          expect(card.buildCommands('ROLE_MANAGER')).toEqual(['/app', 'security', 'roles', 'ROLE_MANAGER']);
        }
      }
    }
  });
});
