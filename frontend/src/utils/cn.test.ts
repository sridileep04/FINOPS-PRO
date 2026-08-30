import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
    it('joins plain string class names with a space', () => {
        expect(cn('px-2', 'py-4')).toBe('px-2 py-4');
    });

    it('drops falsy values (conditional classes)', () => {
        expect(cn('base', false && 'hidden', undefined, null, 'visible')).toBe('base visible');
    });

    it('resolves conflicting Tailwind utilities to the last one (tailwind-merge behavior)', () => {
        // This is the whole reason the project uses tailwind-merge
        // instead of plain clsx: "px-2 px-4" would otherwise leave both
        // classes in the DOM and let CSS source order (not intent)
        // decide which padding wins.
        expect(cn('px-2', 'px-4')).toBe('px-4');
    });

    it('supports object syntax for conditional classes', () => {
        expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe('text-red-500');
    });

    it('returns an empty string for no meaningful input', () => {
        expect(cn()).toBe('');
        expect(cn(undefined, null, false)).toBe('');
    });
});