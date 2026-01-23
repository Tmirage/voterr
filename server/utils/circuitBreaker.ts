const CIRCUIT_BREAKER_DURATION = 5 * 60 * 1000;

interface CircuitBreakerStatus {
  configured: boolean;
  failed?: boolean;
  error?: string | null;
  circuitOpen?: boolean;
  remainingMinutes?: number;
}

export class CircuitBreaker {
  private lastFailure: string | null = null;
  private lastFailureTime = 0;
  private circuitOpen = false;
  private circuitOpenUntil = 0;

  constructor(_name: string) {
    // name kept for debugging purposes
  }

  isOpen(): boolean {
    if (!this.circuitOpen) return false;
    if (Date.now() >= this.circuitOpenUntil) {
      this.circuitOpen = false;
      return false;
    }
    return true;
  }

  recordFailure(error: string): void {
    this.lastFailure = error;
    this.lastFailureTime = Date.now();
    this.circuitOpen = true;
    this.circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_DURATION;
  }

  recordSuccess(): void {
    this.lastFailure = null;
    this.lastFailureTime = 0;
  }

  reset(): void {
    this.circuitOpen = false;
    this.circuitOpenUntil = 0;
    this.lastFailure = null;
    this.lastFailureTime = 0;
  }

  getStatus(configured: boolean): CircuitBreakerStatus {
    if (!configured) return { configured: false };

    const now = Date.now();
    if (this.circuitOpen && now < this.circuitOpenUntil) {
      const remainingMs = this.circuitOpenUntil - now;
      const remainingMin = Math.ceil(remainingMs / 60000);
      return {
        configured: true,
        failed: true,
        error: this.lastFailure,
        circuitOpen: true,
        remainingMinutes: remainingMin,
      };
    }

    if (this.circuitOpen && now >= this.circuitOpenUntil) {
      this.circuitOpen = false;
    }

    if (this.lastFailure && now - this.lastFailureTime < 60000) {
      return { configured: true, failed: true, error: this.lastFailure };
    }
    return { configured: true, failed: false };
  }
}
