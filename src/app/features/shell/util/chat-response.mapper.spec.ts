import { ChatCodeBlock, ChatTableBlock } from '../models/chat.model';
import { coerceBlocks, mapAnswerPayload, parseAnswerText } from './chat-response.mapper';

describe('parseAnswerText', () => {
  it('returns no blocks for an empty answer', () => {
    expect(parseAnswerText('')).toEqual([]);
    expect(parseAnswerText('   \n ')).toEqual([]);
  });

  it('keeps prose as a single markdown block', () => {
    const blocks = parseAnswerText('You have **26 mechanics**.\n\nAll of them are active.');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('markdown');
  });

  it('extracts a fenced code block with its language', () => {
    const blocks = parseAnswerText('Run this:\n\n```sql\nSELECT 1;\nSELECT 2;\n```\n\nThat is all.');
    expect(blocks.map(block => block.kind)).toEqual(['markdown', 'code', 'markdown']);
    const code = blocks[1] as ChatCodeBlock;
    expect(code.language).toBe('sql');
    expect(code.code).toBe('SELECT 1;\nSELECT 2;');
  });

  it('keeps a multi-line fence intact rather than stopping at the first newline', () => {
    const blocks = parseAnswerText('```\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```');
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as ChatCodeBlock).code).toBe('const a = 1;\nconst b = 2;\nconst c = 3;');
    expect((blocks[0] as ChatCodeBlock).language).toBeNull();
  });

  it('recovers an unterminated fence to the end of the answer', () => {
    const blocks = parseAnswerText('```json\n{ "a": 1 }');
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as ChatCodeBlock).code).toBe('{ "a": 1 }');
  });

  it('turns a GFM table into a table block and keeps the prose around it', () => {
    const answer = [
      'Here is the split:',
      '',
      '| Status | Mechanics |',
      '| --- | ---: |',
      '| ACTIVE | 26 |',
      '| INACTIVE | 0 |',
      '',
      'The count is complete.',
    ].join('\n');

    const blocks = parseAnswerText(answer);
    expect(blocks.map(block => block.kind)).toEqual(['markdown', 'table', 'markdown']);

    const table = blocks[1] as ChatTableBlock;
    expect(table.columns).toEqual([
      { label: 'Status', align: 'start' },
      { label: 'Mechanics', align: 'end' },
    ]);
    expect(table.rows).toEqual([
      ['ACTIVE', '26'],
      ['INACTIVE', '0'],
    ]);
  });

  it('pads and trims rows to the header width', () => {
    const answer = '| A | B |\n| --- | --- |\n| only |\n| one | two | three |';
    const table = parseAnswerText(answer)[0] as ChatTableBlock;
    expect(table.rows).toEqual([
      ['only', ''],
      ['one', 'two'],
    ]);
  });

  it('leaves a pipe line that has no delimiter row as markdown', () => {
    const blocks = parseAnswerText('| not | a table |\njust prose');
    expect(blocks.map(block => block.kind)).toEqual(['markdown']);
  });
});

describe('mapAnswerPayload', () => {
  it('prefers a structured blocks array when the backend sends one', () => {
    const blocks = mapAnswerPayload({
      response: 'ignored',
      blocks: [{ kind: 'text', text: 'from the server' }],
    });
    expect(blocks).toEqual([{ kind: 'text', text: 'from the server' }]);
  });

  it('falls back to parsing the response string when blocks are absent or unusable', () => {
    expect(mapAnswerPayload({ response: 'plain answer' })[0].kind).toBe('markdown');
    expect(mapAnswerPayload({ response: 'plain answer', blocks: [] })[0].kind).toBe('markdown');
    expect(mapAnswerPayload({ response: 'plain answer', blocks: [{ kind: 'nonsense' }] })[0].kind).toBe('markdown');
  });

  it('returns no blocks when the payload carries nothing renderable', () => {
    expect(mapAnswerPayload({})).toEqual([]);
    expect(mapAnswerPayload({ response: 42 })).toEqual([]);
  });

  it('returns nothing for a body that is not an object at all', () => {
    // `ChatResponse` is a compile-time assertion; HttpClient hands back whatever
    // the body parsed to, and an empty or malformed one is null or a primitive.
    for (const body of [null, undefined, 'plain text', 42, true]) {
      expect(mapAnswerPayload(body as never), String(body)).toEqual([]);
    }
  });
});

describe('coerceBlocks', () => {
  it('accepts every known block kind', () => {
    const blocks = coerceBlocks([
      { kind: 'markdown', markdown: '# hi' },
      { kind: 'code', code: 'SELECT 1', language: 'SQL' },
      { kind: 'table', columns: ['A', { label: 'B', align: 'end' }], rows: [[1, 'two']] },
      { kind: 'chart', title: 'By bay', series: [{ label: 'Bay 1', value: 12 }] },
      { kind: 'image', url: '/blob/1', alt: 'tyre wear' },
      { kind: 'file', name: 'bulletin.pdf', sizeBytes: 840_000 },
    ]);

    expect(blocks.map(block => block.kind)).toEqual(['markdown', 'code', 'table', 'chart', 'image', 'file']);
    expect((blocks[1] as ChatCodeBlock).language).toBe('sql');
    expect((blocks[2] as ChatTableBlock).rows).toEqual([['1', 'two']]);
  });

  it('degrades an unknown kind to its text content instead of leaking JSON', () => {
    expect(coerceBlocks([{ kind: 'hologram', text: 'still readable' }])).toEqual([
      { kind: 'text', text: 'still readable' },
    ]);
  });

  it('drops malformed entries', () => {
    expect(coerceBlocks([null, 7, 'string', {}, { kind: 'table' }, { kind: 'chart', series: [] }])).toEqual([]);
  });

  it('accepts an error block, so a failed turn survives a reload', () => {
    const blocks = coerceBlocks([
      {
        kind: 'error',
        messageKey: 'SHELL.CHAT.ERROR.BACKEND',
        detailKey: 'SHELL.CHAT.ERROR.DETAIL_STATUS',
        detailParams: { status: 503 },
        correlationId: 'abc-123',
        retryable: true,
      },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('error');
  });

  it('drops an error block with no message key, and unusable detail params', () => {
    expect(coerceBlocks([{ kind: 'error', retryable: true }])).toEqual([]);
    const [block] = coerceBlocks([
      { kind: 'error', messageKey: 'K', detailParams: { nested: { a: 1 } }, retryable: false },
    ]);
    expect(block.kind === 'error' && block.detailParams).toBeNull();
    expect(block.kind === 'error' && block.retryable).toBe(false);
  });

  it('drops an image that has no text alternative', () => {
    expect(coerceBlocks([{ kind: 'image', url: '/blob/1' }])).toEqual([]);
  });

  it('rejects an image whose url would reach another origin', () => {
    // Bound straight to [src], and Angular's sanitiser does not stop a
    // protocol-relative url — it is a perfectly valid one, to someone else's host.
    for (const url of ['//evil.example/pixel.png', 'java\tscript:alert(1)', '\\\\evil.example\\x']) {
      const blocks = coerceBlocks([{ kind: 'image', url, alt: 'tyre wear' }]);
      expect(blocks.some(block => block.kind === 'image'), url).toBe(false);
    }
  });

  it('keeps an image whose url is safe, normalised', () => {
    const [block] = coerceBlocks([
      { kind: 'image', url: 'https://cdn.example/wear.png', alt: 'tyre wear' },
    ]);
    expect(block).toEqual({
      kind: 'image',
      url: 'https://cdn.example/wear.png',
      alt: 'tyre wear',
      caption: null,
    });
  });

  it('drops an unsafe file url but keeps the file listed', () => {
    const [block] = coerceBlocks([
      { kind: 'file', name: 'inspection.pdf', url: '//evil.example/inspection.pdf' },
    ]);
    expect(block.kind).toBe('file');
    expect(block.kind === 'file' && block.url).toBeNull();
  });
});
