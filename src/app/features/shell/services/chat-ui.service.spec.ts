import { TestBed } from '@angular/core/testing';
import { ChatUiService } from './chat-ui.service';

const HISTORY_RAIL_KEY = 'durion-chat-history-rail';

describe('ChatUiService', () => {
  /** Pin the viewport: the rail's default differs above and below the breakpoint. */
  function pinViewport(narrow: boolean): void {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: narrow } as MediaQueryList);
  }

  function makeService(): ChatUiService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(ChatUiService);
  }

  beforeEach(() => {
    localStorage.clear();
    pinViewport(false);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts closed and never restores an open dialog from storage', () => {
    const service = makeService();
    expect(service.open()).toBe(false);

    service.openModal();
    expect(service.open()).toBe(true);
    expect(localStorage.getItem('durion-chat-collapsed')).toBeNull();

    expect(makeService().open()).toBe(false);
  });

  it('opens, closes and toggles the dialog', () => {
    const service = makeService();

    service.toggle();
    expect(service.open()).toBe(true);

    service.toggle();
    expect(service.open()).toBe(false);

    service.openModal();
    service.close();
    expect(service.open()).toBe(false);
  });

  it('keeps the rail closed by default on a viewport it would cover', () => {
    // Open by default on a phone would show a history list and no message box.
    pinViewport(true);
    expect(makeService().historyRailOpen()).toBe(false);

    pinViewport(false);
    expect(makeService().historyRailOpen()).toBe(true);
  });

  it('falls back to the viewport default, not an unconditional open, when storage throws', () => {
    // A `true` fallback here would open the rail over the composer for a
    // first-time phone user on every throwing read — the same mistake the
    // no-storage branch was already guarded against.
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    pinViewport(true);
    expect(makeService().historyRailOpen()).toBe(false);

    pinViewport(false);
    expect(makeService().historyRailOpen()).toBe(true);

    getItemSpy.mockRestore();
  });

  it('lets a stored preference win at any width', () => {
    pinViewport(false);
    const service = makeService();
    service.toggleHistoryRail();

    pinViewport(true);
    expect(makeService().historyRailOpen()).toBe(false);

    makeService().showHistoryRail();
    pinViewport(true);
    expect(makeService().historyRailOpen()).toBe(true);
  });

  it('persists the history rail preference', () => {
    const service = makeService();
    expect(service.historyRailOpen()).toBe(true);

    service.toggleHistoryRail();
    expect(service.historyRailOpen()).toBe(false);
    expect(localStorage.getItem(HISTORY_RAIL_KEY)).toBe('false');

    expect(makeService().historyRailOpen()).toBe(false);
  });

  it('reopens the rail on request', () => {
    const service = makeService();
    service.toggleHistoryRail();
    service.showHistoryRail();

    expect(service.historyRailOpen()).toBe(true);
    expect(localStorage.getItem(HISTORY_RAIL_KEY)).toBe('true');
  });
});
