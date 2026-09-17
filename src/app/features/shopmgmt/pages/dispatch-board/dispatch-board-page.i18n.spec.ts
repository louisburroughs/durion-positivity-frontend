/**
 * Dispatch board copy guard — asserts the SENTENCES, not the keys.
 *
 * Why this file exists. `dispatch-board-page.component.spec.ts` configures
 * `TranslateModule.forRoot()` with no loader, so `| translate` echoes the key
 * back. Every "rendered text" assertion in that suite is, by construction, an
 * assertion about a key path: a correct key in front of a sentence that no
 * longer describes what the code does is invisible to all of it. Three such
 * stale strings have already shipped on this board and every one was found by
 * hand. This file loads the real `src/assets/i18n/*.json` and asserts what the
 * copy CLAIMS.
 *
 * It also closes a hole in `scripts/i18n/check-missing-keys.mjs`: that script
 * diffs the locale files against `en-US.json` only. It never checks that a key
 * the TypeScript emits exists at all, so a typo in `toClockSuccessKey`,
 * `freeHoursReasonKey`, `binStatusKey` or `toClockErrorKey` puts a raw
 * `SHOPMGMT.…` key path in front of the dispatcher with CI green.
 *
 * How it reads the strings. Plain JSON imports. `tsconfig.json` sets
 * `"module": "preserve"`, which implies `resolveJsonModule`, and the Angular
 * unit-test builder bundles the imported asset, so the browser suite sees the
 * real file contents at the path the app ships. No `fs`, no mirrored copy: a
 * copy of the strings would only ever assert against itself.
 *
 * LIMITS — read before trusting this file. The semantic assertions below are
 * prose assertions. They are only as good as the invariants chosen, they do not
 * read the sentences for sense, and a stale string whose invariant nobody wrote
 * still passes. They are deliberately written against the CLAIM a message makes
 * ("does it blame permissions?", "does it tell the user to drag?") rather than
 * its wording, so an honest rewrite survives and a rewrite that changes what the
 * user is told does not. Each one carries the bug it catches; when the behaviour
 * genuinely changes, change the invariant WITH it rather than deleting it.
 * Semantics are asserted for en-US only. For the other five locales this file
 * asserts structure — key existence and placeholder integrity — not meaning.
 */
import { describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import qpsPloc from '../../../../../assets/i18n/qps-ploc.json';
import { DispatchBoardPageComponent } from './dispatch-board-page.component';

const LOCALES: readonly (readonly [string, unknown])[] = [
  ['en-US', enUS],
  ['es-US', esUS],
  ['es-MX', esMX],
  ['fr-CA', frCA],
  ['fr-FR', frFR],
  ['qps-ploc', qpsPloc],
];

const PREFIX = 'SHOPMGMT.DISPATCH_BOARD.';

/** The string at a dotted key path, or undefined when the path is not a string. */
function lookup(bundle: unknown, key: string): string | undefined {
  let node: unknown = bundle;
  for (const segment of key.split('.')) {
    if (node === null || typeof node !== 'object') {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

/** The en-US string at a key path. Throws rather than silently passing on a miss. */
function en(key: string): string {
  const value = lookup(enUS, key);
  if (value === undefined) {
    throw new Error(`en-US.json has no string at ${key}`);
  }
  return value.toLowerCase();
}

/** The `{{placeholder}}` names in a string, sorted — the string's parameter contract. */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map(match => match[1]).sort();
}

/** Every dotted key under SHOPMGMT.DISPATCH_BOARD whose value is a string. */
function dispatchBoardKeys(bundle: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      out.push(path);
      return;
    }
    if (node === null || typeof node !== 'object') {
      return;
    }
    for (const [segment, child] of Object.entries(node as Record<string, unknown>)) {
      walk(child, path ? `${path}.${segment}` : segment);
    }
  };
  walk(lookupNode(bundle, PREFIX.slice(0, -1)), '');
  return out.map(key => PREFIX + key);
}

function lookupNode(bundle: unknown, key: string): unknown {
  let node: unknown = bundle;
  for (const segment of key.split('.')) {
    if (node === null || typeof node !== 'object') {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/**
 * The keys the component's TypeScript emits, derived from the component itself.
 *
 * `Function.prototype.toString()` on the class returns the class source as it
 * sits in the test bundle, which still carries every string literal and every
 * template literal. Scanning it means a key added to `toClockErrorKey` tomorrow
 * is checked tomorrow, with nobody remembering to extend a list here. The
 * `${suffix}` forms (`…CLOCKED_IN${suffix}`, suffix being '' or '_UNNAMED') are
 * expanded to both variants, which is exactly the named/unnamed pair contract
 * asserted further down.
 */
function emittedKeysFromComponentSource(): string[] {
  const source = DispatchBoardPageComponent.toString();
  const keys = new Set<string>();

  for (const match of source.matchAll(/SHOPMGMT\.DISPATCH_BOARD\.[A-Z0-9_.]+/g)) {
    keys.add(match[0].replace(/\.+$/, ''));
  }
  for (const match of source.matchAll(/SHOPMGMT\.DISPATCH_BOARD\.([A-Z0-9_.]*)\$\{/g)) {
    const base = `${PREFIX}${match[1]}`.replace(/\.+$/, '');
    keys.add(base);
    keys.add(`${base}_UNNAMED`);
  }
  return [...keys].sort();
}

/**
 * Timekeeping and free-hours keys emitted by the TEMPLATE.
 *
 * The compiled template lives in `ɵcmp` and Angular splits embedded views into
 * separate functions, so scanning the component the way the TypeScript keys are
 * scanned above reaches only the root view — it finds none of these. Enumerated
 * instead, derived with:
 *
 *   grep -o "SHOPMGMT\.DISPATCH_BOARD\.[A-Z0-9_.]*" dispatch-board-page.component.html \
 *     | sort -u | grep -E "CLOCK|BREAK|FREE|DUTY"
 *
 * If a key is renamed in the template and not here, the existence check below
 * stops covering it; the template's own key paths remain covered by the
 * component spec's rendered-key assertions.
 */
const TEMPLATE_TIMEKEEPING_KEYS: readonly string[] = [
  'BREAK_AND_OFF',
  'BREAK_END',
  'BREAK_END_ARIA',
  'BREAK_END_ARIA_UNNAMED',
  'BREAK_START',
  'BREAK_START_ARIA',
  'BREAK_START_ARIA_UNNAMED',
  'CLOCK_GROUP_ARIA',
  'CLOCK_GROUP_ARIA_UNNAMED',
  'CLOCK_IN',
  'CLOCK_IN_ARIA',
  'CLOCK_IN_ARIA_UNNAMED',
  'CLOCK_OUT',
  'CLOCK_OUT_ARIA',
  'CLOCK_OUT_ARIA_UNNAMED',
  'EVERYONE_ON_CLOCK',
  'FREE_HOURS',
  'FREE_HOURS_PLACEHOLDER_HINT',
  'ON_DUTY_COUNT',
  'STAT.ON_DUTY',
  'STAT.OUT',
].map(key => PREFIX + key);

describe('dispatch board i18n contract', () => {
  const emitted = emittedKeysFromComponentSource();
  const allEmitted = [...new Set([...emitted, ...TEMPLATE_TIMEKEEPING_KEYS])].sort();

  describe('key derivation', () => {
    /**
     * The derivation is the foundation of every existence assertion below. If a
     * bundler change ever makes the scan return nothing, every "key exists"
     * test would pass vacuously, so the derivation has to assert itself first.
     */
    it('recovers the component key set from the component source', () => {
      expect(emitted.length).toBeGreaterThanOrEqual(50);
      expect(emitted).toContain(`${PREFIX}CLOCK_TODAY_ONLY`);
      expect(emitted).toContain(`${PREFIX}NOT_AVAILABLE_FREE_HOURS_CLOSED`);
      expect(emitted).toContain(`${PREFIX}TOAST.ERROR_CLOCK_GENERIC`);
    });

    it('expands the ${suffix} toast keys into both the named and unnamed variant', () => {
      // toClockSuccessKey / toClockErrorKey / refuseTimekeepingDrop build their
      // key by concatenation, so neither half is greppable on its own.
      expect(emitted).toContain(`${PREFIX}TOAST.CLOCKED_IN`);
      expect(emitted).toContain(`${PREFIX}TOAST.CLOCKED_IN_UNNAMED`);
      expect(emitted).toContain(`${PREFIX}TOAST.ERROR_NOT_ON_BREAK_UNNAMED`);
      expect(emitted).toContain(`${PREFIX}TOAST.ERROR_OFF_DUTY_NOT_CHANGEABLE_UNNAMED`);
    });
  });

  describe('every key the board emits resolves to a string', () => {
    /**
     * check-missing-keys.mjs compares the locale files with each other and can
     * therefore never see a key the code emits and NO file carries. That key
     * renders as the literal path — "SHOPMGMT.DISPATCH_BOARD.TOAST.CLOCKD_IN" —
     * in a toast, with CI green.
     */
    for (const [locale, bundle] of LOCALES) {
      it(`${locale} carries every emitted key`, () => {
        const missing = allEmitted.filter(key => lookup(bundle, key) === undefined);
        expect(missing).toEqual([]);
      });
    }
  });

  describe('placeholder integrity', () => {
    const unnamedKeys = dispatchBoardKeys(enUS).filter(key => key.endsWith('_UNNAMED'));

    it('finds the unnamed variants it is meant to check', () => {
      expect(unnamedKeys.length).toBeGreaterThanOrEqual(15);
    });

    /**
     * ngx-translate leaves an unresolved placeholder in the output verbatim, so
     * a `{{mechanic}}` in a message reached only when the mechanic has no name
     * puts that token in front of the dispatcher. Four clock error toasts
     * shipped exactly that way: they had no unnamed twin at all.
     */
    for (const [locale, bundle] of LOCALES) {
      it(`${locale} keeps person placeholders out of the unnamed variants`, () => {
        const offenders = unnamedKeys.filter(key => {
          const value = lookup(bundle, key);
          return value !== undefined && /\{\{\s*(mechanic|name)\s*\}\}/.test(value);
        });
        expect(offenders).toEqual([]);
      });
    }

    /**
     * An unnamed variant exists to drop a placeholder the caller cannot fill, so
     * its named twin must exist and must carry strictly more placeholders than
     * it does. A twin with the same set means the "unnamed" variant is not
     * actually dropping anything — the pair is decorative and the caller that
     * picks between them is deciding nothing. Stated as a superset rather than
     * as `{{mechanic}}`, because the bay pair drops `{{bay}}`.
     */
    it('gives every unnamed variant a named twin that carries strictly more placeholders', () => {
      const broken = unnamedKeys.filter(key => {
        const unnamed = lookup(enUS, key);
        const twin = lookup(enUS, key.slice(0, -'_UNNAMED'.length));
        if (unnamed === undefined || twin === undefined) {
          return true;
        }
        const dropped = placeholders(twin).filter(name => !placeholders(unnamed).includes(name));
        const added = placeholders(unnamed).filter(name => !placeholders(twin).includes(name));
        return dropped.length === 0 || added.length > 0;
      });
      expect(broken).toEqual([]);
    });

    /**
     * A translation that drops `{{mechanic}}` loses the name; one that invents
     * `{{name}}` renders the raw token, because the caller passes what en-US
     * asked for. Both are structural and checkable without reading the language.
     */
    for (const [locale, bundle] of LOCALES) {
      it(`${locale} uses the same placeholders as en-US`, () => {
        const mismatched = dispatchBoardKeys(enUS)
          .map(key => ({ key, base: lookup(enUS, key), target: lookup(bundle, key) }))
          .filter(
            ({ base, target }) =>
              base !== undefined &&
              target !== undefined &&
              placeholders(base).join(',') !== placeholders(target).join(',')
          )
          .map(({ key }) => key);
        expect(mismatched).toEqual([]);
      });
    }
  });

  /**
   * The point of the file. Each assertion names the claim the message must or
   * must not make, and the bug that claim being wrong produces.
   */
  describe('en-US says what the code does — free hours', () => {
    /**
     * BUG CAUGHT: NOT_AVAILABLE_FREE_HOURS_CLOSED once carried the off-roster
     * sentence ("this mechanic is not on the location roster"), which told the
     * dispatcher to go and fix a roster on a day the shop simply was not open.
     * freeHoursReasonKey returns this key only for reason CLOSED.
     */
    it('blames a closed shop, and only a closed shop, for the CLOSED placeholder', () => {
      const closed = en(`${PREFIX}NOT_AVAILABLE_FREE_HOURS_CLOSED`);
      expect(closed).toContain('closed');
      expect(closed).not.toContain('roster');
    });

    /** The OFF_ROSTER twin has to carry the fact the CLOSED one must not. */
    it('blames the roster for the OFF_ROSTER placeholder', () => {
      expect(en(`${PREFIX}NOT_AVAILABLE_FREE_HOURS_OFF_ROSTER`)).toContain('roster');
    });

    /**
     * The component comment is explicit that collapsing these hides a data
     * problem behind a normal day; identical copy is that collapse, arriving by
     * copy-paste instead of by decision.
     */
    it('keeps the three free-hours reasons distinct', () => {
      const reasons = [
        en(`${PREFIX}NOT_AVAILABLE_FREE_HOURS`),
        en(`${PREFIX}NOT_AVAILABLE_FREE_HOURS_CLOSED`),
        en(`${PREFIX}NOT_AVAILABLE_FREE_HOURS_OFF_ROSTER`),
      ];
      expect(new Set(reasons).size).toBe(3);
    });

    /**
     * BUG CLASS: a failed or unusable read reported as a permissions decision.
     * This is the default branch of freeHoursReasonKey — the board could not get
     * a usable shift window. Telling the dispatcher it is an access problem
     * sends them to ask for a grant they already hold, and buries the data bug.
     */
    it('does not blame permissions, a closed shop or the roster for an unreadable window', () => {
      const generic = en(`${PREFIX}NOT_AVAILABLE_FREE_HOURS`);
      expect(generic).not.toMatch(/permission|access|authoriz|authoris/);
      expect(generic).not.toContain('closed');
      expect(generic).not.toContain('roster');
    });

    /**
     * The figure is the shop's operating hours standing in for a real shift, so
     * it is the same window for everyone. A hint that drops the disclosure lets
     * the dispatcher read a shared number as this mechanic's own capacity.
     */
    it('discloses that the free-hours window is shared, not per mechanic', () => {
      const hint = en(`${PREFIX}FREE_HOURS_PLACEHOLDER_HINT`);
      expect(hint).toContain('hours');
      expect(hint).toMatch(/same|shared|shares|every/);
    });
  });

  describe('en-US says what the code does — the break bin note', () => {
    /**
     * BUG CAUGHT: BREAK_OTHER_DAY was reworded to advertise the drag. binNoteKey
     * returns it only when the board is NOT showing today, and on that board the
     * drop handlers refuse — so the note was instructing the dispatcher to
     * perform the one gesture the page will not accept.
     */
    it('never instructs a drag on the note shown where dragging is refused', () => {
      expect(en(`${PREFIX}BREAK_OTHER_DAY`)).not.toContain('drag');
    });

    it('says why timekeeping is unavailable on another date', () => {
      expect(en(`${PREFIX}BREAK_OTHER_DAY`)).toMatch(/today|date/);
    });

    /** The one branch where the drag IS live must still describe it. */
    it('describes the drag on the note shown where dragging works', () => {
      expect(en(`${PREFIX}BREAK_DRAG_HINT`)).toContain('drag');
    });

    /**
     * BUG CLASS, from the component comment: the blocker here is the missing
     * grant, not HR. A note that blames a system that is not the blocker sends
     * the dispatcher to the wrong team.
     */
    it('names the missing permission on the no-permission note', () => {
      const note = en(`${PREFIX}BREAK_NO_PERMISSION`);
      expect(note).toContain('permission');
      expect(note).not.toBe(en(`${PREFIX}BREAK_OTHER_DAY`));
    });
  });

  describe('en-US says what the code does — the clock hint', () => {
    /**
     * BUG CAUGHT: CLOCK_TODAY_ONLY was reworded to blame permissions.
     * clockHintKey returns it purely because the board is showing another date;
     * the caller's grant is not consulted on that branch, so the message accused
     * a permission that was never checked and could never be fixed.
     */
    it('blames the date, not permissions, when the board is off today', () => {
      const hint = en(`${PREFIX}CLOCK_TODAY_ONLY`);
      expect(hint).not.toMatch(/permission|access|authoriz|authoris/);
      expect(hint).toMatch(/today|date/);
    });

    /**
     * BUG CAUGHT (the regression the fix above introduced): CLOCK_STATE_UNREAD
     * is the state EVERY card is in for the first round trip of every load,
     * because clock enrichment starts after render. Reporting that as a
     * permissions decision tells every dispatcher, on every load, to go and ask
     * for access they already hold.
     */
    it('reports an unread clock as a read that did not land, not as permissions', () => {
      const hint = en(`${PREFIX}CLOCK_STATE_UNREAD`);
      expect(hint).not.toMatch(/permission|access|authoriz|authoris/);
      expect(hint).toMatch(/read|unavailable|could not|couldn't/);
    });

    /**
     * Its twin IS the permissions case: pos-people nulls clockState for a row the
     * caller holds no people:timekeeping:view over. If this one stops naming
     * permissions the pair has been swapped and both messages now lie.
     */
    it('names permissions on the hint that really is a permissions decision', () => {
      expect(en(`${PREFIX}NOT_AVAILABLE_CLOCK_STATE`)).toMatch(/permission/);
    });

    it('keeps the three clock hints distinct', () => {
      const hints = [
        en(`${PREFIX}CLOCK_TODAY_ONLY`),
        en(`${PREFIX}CLOCK_STATE_UNREAD`),
        en(`${PREFIX}NOT_AVAILABLE_CLOCK_STATE`),
      ];
      expect(new Set(hints).size).toBe(3);
    });
  });

  describe('en-US says what the code does — the bin chip', () => {
    /**
     * binStatusKey words these apart on purpose: OFF_DUTY covers approved time
     * off, which this board may not change, and NOT_CLOCKED_IN covers someone
     * the dispatcher can clock in right here. One shared label would hide which
     * of the two the dispatcher is looking at.
     */
    it('distinguishes approved time off from simply not being clocked in', () => {
      const offDuty = en(`${PREFIX}OFF_DUTY`);
      const notClockedIn = en(`${PREFIX}NOT_CLOCKED_IN`);
      expect(offDuty).not.toBe(notClockedIn);
      expect(notClockedIn).toContain('clock');
    });

    /** BREAK is its own branch of binStatusKey; the off-duty chip is not a break. */
    it('does not call the off-duty chip a break', () => {
      expect(en(`${PREFIX}OFF_DUTY`)).not.toContain('break');
    });
  });

  // WCAG 2.2 SC 2.5.3 (Label in Name). A speech-input user says the words they
// can see: "click End break". If the accessible name does not contain the
// visible label, the control cannot be activated that way. axe does not check
// this rule, and a mirrored copy of these strings in a component spec cannot
// check it either — only the real file can, which is why it lives here.
//
// `BREAK_END_ARIA` shipped as "End the break for {{name}}" against a visible
// "End break", which fails the rule on the definite article alone.
describe('en-US clock controls satisfy Label in Name', () => {
  const PAIRS: readonly (readonly [string, string])[] = [
    ['CLOCK_IN', 'CLOCK_IN_ARIA'],
    ['CLOCK_OUT', 'CLOCK_OUT_ARIA'],
    ['BREAK_START', 'BREAK_START_ARIA'],
    ['BREAK_END', 'BREAK_END_ARIA'],
  ];

  for (const [visibleKey, ariaKey] of PAIRS) {
    it(`${ariaKey} contains the visible ${visibleKey}`, () => {
      const visible = lookup(enUS, PREFIX + visibleKey);
      const aria = lookup(enUS, PREFIX + ariaKey);
      expect(visible, visibleKey).toBeTypeOf('string');
      expect(aria, ariaKey).toBeTypeOf('string');
      expect(aria!.toLowerCase()).toContain(visible!.toLowerCase());
    });
  }
});

describe('en-US says what the code does — timekeeping toasts', () => {
    /** toClockErrorKey returns this one for HTTP 403 and nothing else. */
    it('names permissions on the forbidden toast', () => {
      expect(en(`${PREFIX}TOAST.ERROR_CLOCK_FORBIDDEN`)).toContain('permission');
    });

    /**
     * BUG CLASS: PERSON_NOT_FOUND is a record problem — the person is not on
     * file in timekeeping. Dressing it as an access problem sends the dispatcher
     * to request a grant that will not create the missing record.
     */
    it('does not blame permissions for a person timekeeping does not know', () => {
      expect(en(`${PREFIX}TOAST.ERROR_CLOCK_PERSON_NOT_FOUND`)).not.toMatch(
        /permission|access|authoriz|authoris/
      );
    });

    /**
     * refuseTimekeepingDrop: a mechanic in the bin for time off is HR's record,
     * not a session this board can end. Both variants must say where the change
     * has to come from, and neither may invite a retry that can never work.
     */
    for (const key of [
      `${PREFIX}TOAST.ERROR_OFF_DUTY_NOT_CHANGEABLE`,
      `${PREFIX}TOAST.ERROR_OFF_DUTY_NOT_CHANGEABLE_UNNAMED`,
    ]) {
      it(`points ${key.slice(PREFIX.length)} at HR rather than at a retry`, () => {
        const message = en(key);
        expect(message).toMatch(/\bhr\b/);
        expect(message).toContain('time off');
        expect(message).not.toMatch(/try again|retry/);
      });
    }

    /** The refusal has to name the fix: clock them in first, then break. */
    for (const key of [
      `${PREFIX}TOAST.ERROR_BREAK_NEEDS_CLOCK_IN`,
      `${PREFIX}TOAST.ERROR_BREAK_NEEDS_CLOCK_IN_UNNAMED`,
    ]) {
      it(`tells the dispatcher to clock in first in ${key.slice(PREFIX.length)}`, () => {
        const message = en(key);
        expect(message).toContain('clock');
        expect(message).toContain('break');
      });
    }

    /**
     * BUG CLASS: a state conflict reported as a transient failure. These four
     * come from a 409/404 that says the mechanic is already in the state asked
     * for; repeating the request produces the same answer forever. Only
     * ERROR_CLOCK_GENERIC, which covers failures that may be transient, may
     * invite a retry.
     */
    for (const key of [
      `${PREFIX}TOAST.ERROR_ALREADY_CLOCKED_IN`,
      `${PREFIX}TOAST.ERROR_NOT_CLOCKED_IN`,
      `${PREFIX}TOAST.ERROR_ALREADY_ON_BREAK`,
      `${PREFIX}TOAST.ERROR_NOT_ON_BREAK`,
    ]) {
      it(`does not invite a retry on the state conflict ${key.slice(PREFIX.length)}`, () => {
        expect(en(key)).not.toMatch(/try again|retry/);
        expect(en(`${key}_UNNAMED`)).not.toMatch(/try again|retry/);
      });
    }
  });
});
