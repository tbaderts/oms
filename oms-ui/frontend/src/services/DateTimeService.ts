// DateTimeService.ts - Handle conversion between ISO-8601 instant strings and locale display
// Backend uses java.time.Instant (ISO-8601 format with Z suffix, e.g., "2025-11-27T08:44:00Z")
// UI displays dates/times according to user's locale

export class DateTimeService {
  private static instance: DateTimeService;

  private constructor() {}

  public static getInstance(): DateTimeService {
    if (!DateTimeService.instance) {
      DateTimeService.instance = new DateTimeService();
    }
    return DateTimeService.instance;
  }

  /**
   * Parse an ISO-8601 instant string from the backend into a Date object.
   * Handles both 'Z' suffix and offset formats.
   */
  public parseInstant(isoString: string | null | undefined): Date | null {
    if (!isoString) {
      return null;
    }
    try {
      const date = new Date(isoString);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  /**
   * Format a Date to ISO-8601 instant string for sending to backend.
   * Always uses UTC with 'Z' suffix.
   */
  public toInstantString(date: Date | null | undefined): string | null {
    if (!date) {
      return null;
    }
    try {
      return date.toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Format an ISO-8601 instant string for display according to user's locale.
   * Shows both date and time.
   */
  public formatForDisplay(isoString: string | null | undefined): string {
    const date = this.parseInstant(isoString);
    if (!date) {
      return '';
    }
    return date.toLocaleString();
  }

  /**
   * Format an ISO-8601 instant string for display with date only.
   */
  public formatDateForDisplay(isoString: string | null | undefined): string {
    const date = this.parseInstant(isoString);
    if (!date) {
      return '';
    }
    return date.toLocaleDateString();
  }

  /**
   * Format an ISO-8601 instant string for display with time only.
   */
  public formatTimeForDisplay(isoString: string | null | undefined): string {
    const date = this.parseInstant(isoString);
    if (!date) {
      return '';
    }
    return date.toLocaleTimeString();
  }

  /**
   * Format a Date for display according to user's locale.
   */
  public formatDateObjectForDisplay(date: Date | null | undefined): string {
    if (!date) {
      return '';
    }
    return date.toLocaleString();
  }

  /**
   * Convert a local datetime-local input value to ISO-8601 instant string.
   * Input format: "2025-11-27T08:44" (local time)
   * Output format: "2025-11-27T08:44:00.000Z" (UTC)
   */
  public localInputToInstant(localDateTimeValue: string | null | undefined): string | null {
    if (!localDateTimeValue) {
      return null;
    }
    try {
      // Parse as local datetime and convert to UTC
      const date = new Date(localDateTimeValue);
      if (isNaN(date.getTime())) {
        return null;
      }
      return date.toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Convert an ISO-8601 instant string to a value suitable for datetime-local input.
   * Input format: "2025-11-27T08:44:00Z" (UTC)
   * Output format: "2025-11-27T10:44" (local time, for +02:00 timezone)
   */
  public instantToLocalInput(isoString: string | null | undefined): string {
    const date = this.parseInstant(isoString);
    if (!date) {
      return '';
    }
    // Format as local datetime for input element
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  /**
   * Get the user's timezone offset string (e.g., "+02:00" or "-05:00")
   */
  public getTimezoneOffset(): string {
    const offset = new Date().getTimezoneOffset();
    const sign = offset <= 0 ? '+' : '-';
    const absOffset = Math.abs(offset);
    const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
    const minutes = String(absOffset % 60).padStart(2, '0');
    return `${sign}${hours}:${minutes}`;
  }

  /**
   * Get the user's timezone name (e.g., "America/New_York")
   */
  public getTimezoneName(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  /**
   * Format for API query parameters (date range filters).
   * Ensures proper ISO-8601 instant format with Z suffix.
   */
  public formatForApiQuery(date: Date | string | null | undefined): string | null {
    if (!date) {
      return null;
    }
    if (typeof date === 'string') {
      const parsed = this.parseInstant(date);
      return parsed ? parsed.toISOString() : null;
    }
    return date.toISOString();
  }
}

// Export singleton instance for convenience
export const dateTimeService = DateTimeService.getInstance();
