import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@/lib/brand/brand-config';

describe('DEFAULT_BRAND (single-brand build)', () => {
  it('uses the original product identity for full chrome', () => {
    expect(DEFAULT_BRAND.productName).toBe('Oh my AI class-R');
    expect(DEFAULT_BRAND.shortName).toBe('OMAIC-R');
    expect(DEFAULT_BRAND.markSrc).toBe('/rhodes-island-mark.png');
    expect(DEFAULT_BRAND.themeColor).toBe('#0d9488');
  });

  it('marks its horizontal logo as already containing the wordmark', () => {
    expect(DEFAULT_BRAND.logoHasWordmark).toBe(true);
    expect(DEFAULT_BRAND.logoSrc).toBe('/logos/rhodes-island-horizontal.svg');
  });
});
