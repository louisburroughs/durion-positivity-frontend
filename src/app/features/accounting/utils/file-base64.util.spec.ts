import { describe, expect, it } from 'vitest';
import { fileToBase64, parseAmountInput } from './file-base64.util';

describe('fileToBase64', () => {
  it('encodes the file bytes as standard base64', async () => {
    const file = new Blob(['Date,Amount\n2026-09-01,12.50\n'], { type: 'text/csv' });
    expect(await fileToBase64(file)).toBe(btoa('Date,Amount\n2026-09-01,12.50\n'));
  });

  it('encodes a file larger than one chunk', async () => {
    const text = 'x'.repeat(0x8000 * 2 + 7);
    expect(await fileToBase64(new Blob([text]))).toBe(btoa(text));
  });
});

describe('parseAmountInput', () => {
  it.each([
    ['1234.56', 1234.56],
    ['-45.67', -45.67],
    ['1 234,56', 1234.56],
    ['12345', 12345],
  ])('reads %s as %s', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,234.56', '1.2.3', '$12', '9'.repeat(400)])('refuses %s', input => {
    expect(parseAmountInput(input)).toBeNull();
  });
});
