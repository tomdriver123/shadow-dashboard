import { Injectable } from '@angular/core';

const KEY = 'shadow.portal.enteredFromTom';

/**
 * Remembers, for the current browser tab only, that Sabrina's portal was
 * entered from Tom's dashboard. Her career overview shows a link back to
 * Tom's side only in that case, so a shared /sabrina URL opened on its own
 * looks like a standalone app.
 */
@Injectable({ providedIn: 'root' })
export class PortalService {
  private flag = this.readFlag();

  get enteredFromTom(): boolean {
    return this.flag;
  }

  markEnteredFromTom(): void {
    this.flag = true;
    try { sessionStorage.setItem(KEY, '1'); } catch { /* storage unavailable, memory flag still works */ }
  }

  clear(): void {
    this.flag = false;
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  }

  private readFlag(): boolean {
    try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
  }
}
