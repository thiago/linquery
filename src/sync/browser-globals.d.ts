/**
 * Type declarations for browser globals
 *
 * These types allow the sync module to work in both browser and Node.js environments
 */

/// <reference lib="dom" />

declare global {
  interface GlobalThis {
    window?: Window;
    navigator?: Navigator;
    localStorage?: Storage;
  }
}

export {};
