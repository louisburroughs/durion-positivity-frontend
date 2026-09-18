import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarkdownViewComponent } from './markdown-view.component';

describe('MarkdownViewComponent', () => {
  let fixture: ComponentFixture<MarkdownViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MarkdownViewComponent] }).compileComponents();
    fixture = TestBed.createComponent(MarkdownViewComponent);
  });

  function render(markdown: string): HTMLElement {
    fixture.componentRef.setInput('markdown', markdown);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders headings beneath the dialog title, clamping at h6', () => {
    const host = render('# one\n\n## two\n\n### three\n\n#### four\n\n##### five');
    expect([...host.querySelectorAll('.md-heading')].map(node => node.tagName)).toEqual([
      'H3',
      'H4',
      'H5',
      'H6',
      'H6',
    ]);
  });

  it('renders paragraphs, emphasis and inline code as real elements', () => {
    const host = render('You have **26** mechanics, _all_ active. Call `POST /close`.');
    expect(host.querySelector('p.md-paragraph')).not.toBeNull();
    expect(host.querySelector('strong')?.textContent).toBe('26');
    expect(host.querySelector('em')?.textContent).toBe('all');
    expect(host.querySelector('code.md-code')?.textContent).toBe('POST /close');
  });

  it('renders both list flavours with one item per entry', () => {
    const host = render('- first\n- second\n\n1. one\n2. two');
    expect(host.querySelectorAll('ul.md-list li')).toHaveLength(2);
    expect(host.querySelectorAll('ol.md-list li')).toHaveLength(2);
  });

  it('renders a block quote and a thematic break', () => {
    const host = render('> closing is irreversible\n\n---');
    expect(host.querySelector('blockquote.md-quote')?.textContent).toContain('closing is irreversible');
    expect(host.querySelector('hr.md-rule')).not.toBeNull();
  });

  it('opens an external link in a new tab with a safe rel, and an in-app one in place', () => {
    const host = render('[docs](https://durion.example/docs) and [roster](/app/people)');
    const [external, internal] = [...host.querySelectorAll('a.md-link')];

    expect(external.getAttribute('href')).toBe('https://durion.example/docs');
    expect(external.getAttribute('target')).toBe('_blank');
    expect(external.getAttribute('rel')).toBe('noopener noreferrer');

    expect(internal.getAttribute('href')).toBe('/app/people');
    expect(internal.getAttribute('target')).toBeNull();
    expect(internal.getAttribute('rel')).toBeNull();
  });

  it('nests inline spans inside a link', () => {
    const host = render('[**the roster**](/app/people)');
    expect(host.querySelector('a.md-link strong')?.textContent).toBe('the roster');
  });

  it('never builds markup from the source, whatever it contains', () => {
    const host = render(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<b>not bold</b>',
    );

    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('b')).toBeNull();
    expect(host.textContent).toContain('<script>alert(1)</script>');
    expect(host.textContent).toContain('<b>not bold</b>');
  });

  it('renders nothing for empty markdown rather than an empty shell', () => {
    const host = render('');
    expect(host.textContent?.trim()).toBe('');
  });

  it('re-renders when the source changes', () => {
    render('first answer');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('first answer');

    const host = render('## second answer');
    expect(host.querySelector('h4.md-heading')?.textContent).toContain('second answer');
    expect(host.textContent).not.toContain('first answer');
  });
});
