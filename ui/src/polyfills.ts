// Browser polyfills for Node.js modules
import { Buffer } from 'buffer';

// Make Buffer available globally
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

// Setup process polyfill with nextTick
if (typeof (globalThis as unknown as { process?: unknown }).process === 'undefined') {
  (globalThis as unknown as { process: unknown }).process = {
    env: {},
    browser: true,
    version: '',
    platform: 'browser',
    nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
      Promise.resolve().then(() => callback(...args));
    },
  };
}

// Ensure global is available
if (typeof (globalThis as unknown as { global?: unknown }).global === 'undefined') {
  (globalThis as unknown as { global: unknown }).global = globalThis;
}
