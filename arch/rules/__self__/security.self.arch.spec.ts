import {
  sec01Finder,
  sec02Finder,
  sec03Finder,
  sec04Finder,
  sec05Finder,
  sec06Finder,
  sec07Finder,
  sec08Finder,
  sec09Finder,
} from '../security.rules';

describe('[SEC-01] no innerHTML/outerHTML/DomSanitizer bypass sinks', () => {
  it('flags an innerHTML assignment', () => {
    expect(sec01Finder({ path: 'x.ts', content: `el.innerHTML = html;` })).toEqual(['assignment to .innerHTML']);
  });
  it('flags any outerHTML access, not just assignment', () => {
    expect(sec01Finder({ path: 'x.ts', content: `const h = el.outerHTML;` })).toEqual(['access: .outerHTML']);
  });
  it('flags insertAdjacentHTML(', () => {
    expect(sec01Finder({ path: 'x.ts', content: `el.insertAdjacentHTML('beforeend', html);` })).toEqual(['call: insertAdjacentHTML(']);
  });
  it('flags document.write(', () => {
    expect(sec01Finder({ path: 'x.ts', content: `document.write(html);` })).toEqual(['call: document.write(']);
  });
  it('flags a bypassSecurityTrust* call', () => {
    expect(sec01Finder({ path: 'x.ts', content: `sanitizer.bypassSecurityTrustHtml(html);` })).toEqual([
      'call: bypassSecurityTrustHtml(',
    ]);
  });
  it('flags a DomSanitizer identifier', () => {
    expect(sec01Finder({ path: 'x.ts', content: `import { DomSanitizer } from '@angular/platform-browser';` })).toContain(
      'identifier: DomSanitizer',
    );
  });
  it('does not flag an unrelated .innerText assignment', () => {
    expect(sec01Finder({ path: 'x.ts', content: `el.innerText = text;` })).toEqual([]);
  });
  it('ignores a comment mention', () => {
    expect(sec01Finder({ path: 'x.ts', content: `// never set innerHTML\nconst x = 1;` })).toEqual([]);
  });
});

describe('[SEC-02] no [innerHTML]/[outerHTML] binding in templates', () => {
  it('flags a bound [innerHTML]', () => {
    expect(sec02Finder({ path: 'x.html', content: `<div [innerHTML]="html"></div>` })).toEqual(['<div [innerHTML]>']);
  });
  it('does not flag an unrelated binding', () => {
    expect(sec02Finder({ path: 'x.html', content: `<div [textContent]="text"></div>` })).toEqual([]);
  });
  it('does not flag plain interpolation', () => {
    expect(sec02Finder({ path: 'x.html', content: `<div>{{ text }}</div>` })).toEqual([]);
  });
});

describe('[SEC-03] no eval( or new Function(', () => {
  it('flags eval(', () => {
    expect(sec03Finder({ path: 'x.ts', content: `eval(code);` })).toEqual(['call: eval(']);
  });
  it('flags new Function(', () => {
    expect(sec03Finder({ path: 'x.ts', content: `const f = new Function('a', 'return a');` })).toEqual(['call: new Function(']);
  });
  it('does not flag a differently-named function', () => {
    expect(sec03Finder({ path: 'x.ts', content: `myEval(code);` })).toEqual([]);
  });
});

describe('[SEC-04] no bare location navigation', () => {
  it('flags location.href assignment', () => {
    expect(sec04Finder({ path: 'x.ts', content: `location.href = url;` })).toEqual(['assignment to location.href']);
  });
  it('flags window.location.assign(', () => {
    expect(sec04Finder({ path: 'x.ts', content: `window.location.assign(url);` })).toEqual(['call: window.location.assign(']);
  });
  it('flags location.replace(', () => {
    expect(sec04Finder({ path: 'x.ts', content: `location.replace(url);` })).toEqual(['call: location.replace(']);
  });
  it('does not flag Angular Location.replaceState (a different method)', () => {
    expect(sec04Finder({ path: 'x.ts', content: `this.location.replaceState(url);` })).toEqual([]);
  });
  it('does not flag an unrelated variable declaration named location', () => {
    expect(sec04Finder({ path: 'x.ts', content: `const location = inject(Location);` })).toEqual([]);
  });
});

describe('[SEC-05] in-app navigation uses routerLink; external links carry rel', () => {
  it('flags a bare in-app href', () => {
    expect(sec05Finder({ path: 'x.html', content: `<a href="/dashboard">Go</a>` })).toEqual([
      '<a href="/dashboard"> bare in-app href, use routerLink',
    ]);
  });
  it('flags an external link missing rel', () => {
    expect(sec05Finder({ path: 'x.html', content: `<a href="https://example.com">Ext</a>` })).toEqual([
      '<a href="https://example.com"> external link missing rel noopener/noreferrer',
    ]);
  });
  it('accepts an external link with a safe rel', () => {
    expect(sec05Finder({ path: 'x.html', content: `<a href="https://example.com" rel="noopener noreferrer">Ext</a>` })).toEqual([]);
  });
  it('accepts a same-page fragment link', () => {
    expect(sec05Finder({ path: 'x.html', content: `<a href="#section">Jump</a>` })).toEqual([]);
  });
  it('accepts an href alongside routerLink', () => {
    expect(sec05Finder({ path: 'x.html', content: `<a href="/x" routerLink="/x">Go</a>` })).toEqual([]);
  });
  it('accepts mailto:/tel: links', () => {
    expect(sec05Finder({ path: 'x.html', content: `<a href="mailto:a@b.com">Mail</a>` })).toEqual([]);
  });
});

describe('[SEC-06] <a (click)> without href/routerLink must be a <button>', () => {
  it('flags an <a> with (click) and no href/routerLink', () => {
    expect(sec06Finder({ path: 'x.html', content: `<a (click)="doThing()">Click</a>` })).toEqual([
      '<a (click)> without href/routerLink — use <button>',
    ]);
  });
  it('accepts an <a> with (click) and an href', () => {
    expect(sec06Finder({ path: 'x.html', content: `<a href="/x" (click)="track()">Click</a>` })).toEqual([]);
  });
  it('accepts an <a> with (click) and a bound routerLink', () => {
    expect(sec06Finder({ path: 'x.html', content: `<a [routerLink]="['/x']" (click)="track()">Click</a>` })).toEqual([]);
  });
  it('does not flag a <button> with (click)', () => {
    expect(sec06Finder({ path: 'x.html', content: `<button (click)="doThing()">Click</button>` })).toEqual([]);
  });
});

describe('[SEC-07] URL scheme validation lives only in markdown.util.ts', () => {
  it('flags a scheme-allowlist regex literal', () => {
    expect(sec07Finder({ path: 'x.ts', content: `const SAFE = /^(?:https?:|mailto:)/i;` })).toEqual([
      'regex literal: /^(?:https?:|mailto:)/i',
    ]);
  });
  it('does not flag a regex mentioning only one scheme', () => {
    expect(sec07Finder({ path: 'x.ts', content: `const FETCHABLE = /^https?:/i;` })).toEqual([]);
  });
  it('ignores a comment mention', () => {
    expect(sec07Finder({ path: 'x.ts', content: `// see https?: and mailto: handling elsewhere\nconst x = 1;` })).toEqual([]);
  });
});

describe('[SEC-08] URL.revokeObjectURL runs inside setTimeout(', () => {
  it('flags a synchronous revokeObjectURL', () => {
    expect(sec08Finder({ path: 'x.ts', content: `URL.revokeObjectURL(url);` })).toEqual(['URL.revokeObjectURL not inside setTimeout(']);
  });
  it('accepts a revokeObjectURL deferred via setTimeout', () => {
    expect(sec08Finder({ path: 'x.ts', content: `setTimeout(() => URL.revokeObjectURL(url));` })).toEqual([]);
  });
});

describe('[SEC-09] aria-modal/role="dialog" only on <dialog appModalDialog>', () => {
  it('flags role="dialog" + aria-modal on a div', () => {
    expect(sec09Finder({ path: 'x.html', content: `<div role="dialog" aria-modal="true">x</div>` })).toEqual([
      '<div> carries role="dialog"+aria-modal without being <dialog appModalDialog>',
    ]);
  });
  it('flags a <dialog open> with no appModalDialog', () => {
    expect(sec09Finder({ path: 'x.html', content: `<dialog open>x</dialog>` })).toEqual(['<dialog open> without appModalDialog']);
  });
  it('accepts <dialog appModalDialog open>', () => {
    expect(sec09Finder({ path: 'x.html', content: `<dialog appModalDialog open>x</dialog>` })).toEqual([]);
  });
  it('accepts <dialog appModalDialog> with aria-modal', () => {
    expect(sec09Finder({ path: 'x.html', content: `<dialog appModalDialog aria-modal="true">x</dialog>` })).toEqual([]);
  });
  it('does not flag a non-modal alertdialog with no aria-modal (tenant-detail-page carve-out)', () => {
    expect(sec09Finder({ path: 'x.html', content: `<div role="alertdialog">x</div>` })).toEqual([]);
  });
  it('does not flag a <dialog> with no open and no directive (JS-driven showModal())', () => {
    expect(sec09Finder({ path: 'x.html', content: `<dialog #d>x</dialog>` })).toEqual([]);
  });
});
