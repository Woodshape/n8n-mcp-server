import { describe, it, expect } from 'vitest';

describe('hello', () => {
  it('should return a greeting', () => {
    const greet = (name: string) => `Hello, ${name}!`;
    expect(greet('world')).toBe('Hello, world!');
  });
});
