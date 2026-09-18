import { TestBed } from '@angular/core/testing';
import { ChatUiService } from './chat-ui.service';

const HISTORY_RAIL_KEY = 'durion-chat-history-rail';

describe('ChatUiService', () => {
  function makeService(): ChatUiService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(ChatUiService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

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
