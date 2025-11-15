/**
 * ConnectivityManager - Detects and monitors online/offline status
 */

/// <reference path="./browser-globals.d.ts" />

export type ConnectivityListener = (online: boolean) => void;

export interface ConnectivityManagerOptions {
  customCheck?: () => Promise<boolean>; // Custom online check
  checkInterval?: number; // Interval for periodic checks (ms)
}

/**
 * Manages connectivity status and notifications
 */
export class ConnectivityManager {
  private isOnline: boolean = true;
  private listeners: ConnectivityListener[] = [];
  private customCheck?: () => Promise<boolean>;
  private checkInterval?: number;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(options: ConnectivityManagerOptions = {}) {
    this.customCheck = options.customCheck;
    this.checkInterval = options.checkInterval;
    this.initialize();
  }

  /**
   * Initialize connectivity monitoring
   */
  private initialize(): void {
    // Set initial status
    this.isOnline = this.getBrowserOnlineStatus();

    // Listen to browser online/offline events
    if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
      const win = globalThis.window as Window;
      win.addEventListener('online', this.handleOnline);
      win.addEventListener('offline', this.handleOffline);
    }

    // Start periodic check if configured
    if (this.checkInterval && this.checkInterval > 0) {
      this.startPeriodicCheck();
    }
  }

  /**
   * Get browser's online status
   */
  private getBrowserOnlineStatus(): boolean {
    if (typeof globalThis !== 'undefined' && 'navigator' in globalThis) {
      const onlineStatus = (globalThis.navigator as Navigator).onLine;
      // Return true if onLine is undefined (Node.js environment)
      return typeof onlineStatus === 'boolean' ? onlineStatus : true;
    }
    return true;
  }

  /**
   * Handle browser online event
   */
  private handleOnline = (): void => {
    this.setOnline(true);
  };

  /**
   * Handle browser offline event
   */
  private handleOffline = (): void => {
    this.setOnline(false);
  };

  /**
   * Start periodic connectivity check
   */
  private startPeriodicCheck(): void {
    this.intervalId = setInterval(async () => {
      const online = await this.checkOnline();
      if (online !== this.isOnline) {
        this.setOnline(online);
      }
    }, this.checkInterval);
  }

  /**
   * Stop periodic connectivity check
   */
  private stopPeriodicCheck(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Check if currently online
   */
  async checkOnline(): Promise<boolean> {
    // Use custom check if provided
    if (this.customCheck) {
      try {
        return await this.customCheck();
      } catch (error) {
        console.error('Custom online check failed:', error);
        return false;
      }
    }

    // Fallback to browser status
    return this.getBrowserOnlineStatus();
  }

  /**
   * Get current online status (synchronous)
   */
  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Check if offline
   */
  isOffline(): boolean {
    return !this.isOnline;
  }

  /**
   * Register listener for connectivity changes
   */
  onChange(listener: ConnectivityListener): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Remove all listeners
   */
  clearListeners(): void {
    this.listeners = [];
  }

  /**
   * Set online status and notify listeners
   */
  private setOnline(online: boolean): void {
    if (this.isOnline !== online) {
      this.isOnline = online;
      this.notifyListeners(online);
    }
  }

  /**
   * Notify all listeners of status change
   */
  private notifyListeners(online: boolean): void {
    this.listeners.forEach((listener) => {
      try {
        listener(online);
      } catch (error) {
        console.error('Connectivity listener error:', error);
      }
    });
  }

  /**
   * Manually set online status (for testing)
   */
  setManualStatus(online: boolean): void {
    this.setOnline(online);
  }

  /**
   * Wait for online status
   */
  async waitForOnline(timeout?: number): Promise<boolean> {
    if (this.isOnline) {
      return true;
    }

    return new Promise<boolean>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      // Listen for online event
      const unsubscribe = this.onChange((online) => {
        if (online) {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (unsubscribe) {
            unsubscribe();
          }
          resolve(true);
        }
      });

      // Set timeout if provided
      if (timeout) {
        timeoutId = setTimeout(() => {
          if (unsubscribe) {
            unsubscribe();
          }
          reject(new Error(`Timeout waiting for online status (${timeout}ms)`));
        }, timeout);
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopPeriodicCheck();
    this.clearListeners();

    if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
      const win = globalThis.window as Window;
      win.removeEventListener('online', this.handleOnline);
      win.removeEventListener('offline', this.handleOffline);
    }
  }
}
