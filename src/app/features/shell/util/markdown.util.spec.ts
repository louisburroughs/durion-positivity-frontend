import { flattenInline, isSafeHref, parseInline, parseMarkdown } from './markdown.util';

describe('parseMarkdown', () => {
  it('parses an ATX heading at its level', () => {
    const [block] = parseMarkdown('### Closing a workorder');
    expect(block).toEqual({
      type: 'heading',
      level: 3,
      children: [{ type: 'text', value: 'Closing a workorder' }],
    });
  });

  it('caps heading depth at four', () => {
    const [block] = parseMarkdown('###### deep');
    expect(block.type === 'heading' && block.level).toBe(4);
  });

  it('joins wrapped lines into one paragraph and splits on a blank line', () => {
    const blocks = parseMarkdown('one\ntwo\n\nthree');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type === 'paragraph' && flattenInline(blocks[0].children)).toBe('one two');
    expect(blocks[1].type === 'paragraph' && flattenInline(blocks[1].children)).toBe('three');
  });

  it('parses an unordered list without a blank line before it', () => {
    const blocks = parseMarkdown('Rules:\n- first\n- second');
    expect(blocks[0].type).toBe('paragraph');
    const list = blocks[1];
    expect(list.type === 'list' && list.ordered).toBe(false);
    expect(list.type === 'list' && list.items.map(flattenInline)).toEqual(['first', 'second']);
  });

  it('parses an ordered list', () => {
    const [list] = parseMarkdown('1. confirm\n2. post');
    expect(list.type === 'list' && list.ordered).toBe(true);
    expect(list.type === 'list' && list.items).toHaveLength(2);
  });

  it('merges consecutive quote lines into one quote block', () => {
    const [quote] = parseMarkdown('> closing is\n> irreversible');
    expect(quote.type === 'quote' && flattenInline(quote.children)).toBe('closing is irreversible');
  });

  it('parses a thematic break but not emphasis that merely starts with stars', () => {
    expect(parseMarkdown('---')[0].type).toBe('rule');
    expect(parseMarkdown('***bold***')[0].type).toBe('paragraph');
  });

  it('returns no blocks for empty or whitespace-only input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n  \n')).toEqual([]);
  });
});

describe('parseInline', () => {
  it('parses strong, emphasis and code spans', () => {
    expect(parseInline('**26 mechanics**')).toEqual([
      { type: 'strong', children: [{ type: 'text', value: '26 mechanics' }] },
    ]);
    expect(parseInline('_soon_')).toEqual([{ type: 'em', children: [{ type: 'text', value: 'soon' }] }]);
    expect(parseInline('call `POST /close`')).toEqual([
      { type: 'text', value: 'call ' },
      { type: 'code', value: 'POST /close' },
    ]);
  });

  it('keeps surrounding text around a span', () => {
    expect(flattenInline(parseInline('you have **26** today'))).toBe('you have 26 today');
  });

  it('nests spans inside a link', () => {
    const [node] = parseInline('[**the roster**](/app/people)');
    expect(node).toEqual({
      type: 'link',
      href: '/app/people',
      external: false,
      children: [{ type: 'strong', children: [{ type: 'text', value: 'the roster' }] }],
    });
  });

  it('marks an http target as external', () => {
    const [node] = parseInline('[docs](https://durion.example/docs)');
    expect(node.type === 'link' && node.external).toBe(true);
  });

  it('renders an unsafe link target as inert text, keeping the label', () => {
    const nodes = parseInline('[click me](javascript:alert(1))');
    expect(nodes.every(node => node.type !== 'link')).toBe(true);
    expect(flattenInline(nodes)).toContain('click me');
  });

  it('does not treat an unmatched delimiter as a span', () => {
    expect(parseInline('2 * 3 = 6')).toEqual([{ type: 'text', value: '2 * 3 = 6' }]);
  });
});

describe('isSafeHref', () => {
  it('accepts http, mailto and scheme-less targets', () => {
    for (const href of [
      'https://durion.example',
      'http://durion.example',
      'mailto:ops@durion.example',
      '/app/people',
      '#top',
      'people/42',
    ]) {
      expect(isSafeHref(href), href).toBe(true);
    }
  });

  it('rejects script-bearing and empty targets', () => {
    for (const href of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox',
      '  ',
    ]) {
      expect(isSafeHref(href), href).toBe(false);
    }
  });
});
