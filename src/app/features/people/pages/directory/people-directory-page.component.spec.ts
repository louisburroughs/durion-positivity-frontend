import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { PeopleAPIService, Person } from '@durion-sdk/people-contact';
import enUS from '../../../../../assets/i18n/en-US.json';
import { PeopleDirectoryPageComponent } from './people-directory-page.component';

const person = (id: string, primaryEmail: string | undefined): Person => ({
  id: `01960011-0000-7000-8000-00000000000${id}`,
  firstName: 'Dana',
  lastName: `Okafor ${id}`,
  primaryEmail,
});

const peopleApiStub = { listPeople: vi.fn() };

describe('PeopleDirectoryPageComponent', () => {
  let fixture: ComponentFixture<PeopleDirectoryPageComponent>;

  const setup = async (people: Person[]) => {
    vi.resetAllMocks();
    peopleApiStub.listPeople.mockReturnValue(of(people));

    await TestBed.configureTestingModule({
      imports: [PeopleDirectoryPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: PeopleAPIService, useValue: peopleApiStub }],
    }).compileComponents();

    // ADR-0035 §8: copy asserted against the shipped bundle.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(PeopleDirectoryPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  afterEach(() => fixture?.destroy());

  const rows = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tr.directory-row'));

  it('links a valid address as a working mailto target', async () => {
    await setup([person('1', 'dana@example.com')]);
    const link = rows()[0].querySelector<HTMLAnchorElement>('a.directory-email-link');

    expect(link?.getAttribute('href')).toBe('mailto:dana@example.com');
    expect(link?.textContent?.trim()).toBe('dana@example.com');
  });

  it('renders a hostile address as plain text, never as an href (ADR-0065 §2)', async () => {
    const hostile = [
      'a@b.com?bcc=attacker@evil.example',
      'a@b.com%0d%0abcc=attacker%40evil.example',
      'a@b.com%3Fbcc=attacker@evil.example',
      'a%40b.com',
    ];
    await setup(hostile.map((email, i) => person(String(i + 1), email)));

    for (const [i, email] of hostile.entries()) {
      const row = rows()[i];
      expect(row.querySelector('a.directory-email-link'), email).toBeNull();
      expect(row.querySelector('.directory-email-plain')?.textContent?.trim(), email).toBe(email);
    }
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('a[href^="mailto:"]').length).toBe(0);
  });

  it('shows the empty marker when there is no address', async () => {
    await setup([person('1', undefined)]);

    expect(rows()[0].querySelector('.directory-empty-cell')?.textContent?.trim()).toBe('—');
    expect(rows()[0].querySelector('a.directory-email-link')).toBeNull();
  });

  // ── Sortable header buttons (keyboard-operable; th only carries aria-sort) ──

  it('renders three sortable header buttons as <button type="button">', async () => {
    await setup([person('1', 'dana@example.com')]);
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        'th.directory-th--sortable .sort-btn',
      ),
    );

    expect(buttons).toHaveLength(3);
    for (const btn of buttons) {
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.type).toBe('button');
    }
  });

  it('sorts by username when its sort button is clicked, updating aria-sort on that th', async () => {
    await setup([person('1', 'dana@example.com'), person('2', 'aaron@example.com')]);
    const root = fixture.nativeElement as HTMLElement;
    const ths = Array.from(root.querySelectorAll<HTMLTableCellElement>('th.directory-th--sortable'));
    const usernameTh = ths[1];
    const usernameBtn = usernameTh.querySelector<HTMLButtonElement>('.sort-btn');

    expect(usernameTh.getAttribute('aria-sort')).toBe('none');

    usernameBtn?.click();
    fixture.detectChanges();

    expect(usernameTh.getAttribute('aria-sort')).toBe('ascending');
  });

  it('toggles aria-sort on the already-active name column when its button is clicked again', async () => {
    await setup([person('1', 'dana@example.com'), person('2', 'aaron@example.com')]);
    const root = fixture.nativeElement as HTMLElement;
    const nameTh = root.querySelector<HTMLTableCellElement>('th.directory-th--sortable');
    const nameBtn = nameTh?.querySelector<HTMLButtonElement>('.sort-btn');

    expect(nameTh?.getAttribute('aria-sort')).toBe('ascending');

    nameBtn?.click();
    fixture.detectChanges();

    expect(nameTh?.getAttribute('aria-sort')).toBe('descending');
  });

  it('does not toggle sort when the th is clicked outside its button', async () => {
    await setup([person('1', 'dana@example.com')]);
    const root = fixture.nativeElement as HTMLElement;
    const usernameTh = Array.from(root.querySelectorAll<HTMLTableCellElement>('th.directory-th--sortable'))[1];

    usernameTh.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(usernameTh.getAttribute('aria-sort')).toBe('none');
  });
});
