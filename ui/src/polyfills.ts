// Browser polyfills for Node.js modules
import { Buffer } from 'buffer';

// Make Buffer available globally
(globalThis as any).Buffer = Buffer;

// Setup process polyfill with nextTick
if (typeof (globalThis as any).process === 'undefined') {
  (globalThis as any).process = {
    env: {},
    browser: true,
    version: '',
    platform: 'browser',
    nextTick: (callback: Function, ...args: any[]) => {
      Promise.resolve().then(() => callback(...args));
    },
  };
}

// Ensure global is available
if (typeof (globalThis as any).global === 'undefined') {
  (globalThis as any).global = globalThis;
}

export {};
