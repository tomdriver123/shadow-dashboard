import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { FeedbackAuthor, FeedbackEntry, PendingEntry, PendingImage } from './feedback.model';
import { putPending, allPending, deletePending } from './feedback-db';

const AUTHORS: FeedbackAuthor[] = ['tom', 'sabrina'];
const FLUSH_INTERVAL_MS = 60000;
const MAX_DIMENSION = 1600;
const DOWNSCALE_THRESHOLD_BYTES = 1.5 * 1024 * 1024;

interface AuthorState {
  entries: BehaviorSubject<FeedbackEntry[]>;
  serverEntries: FeedbackEntry[];
  pendingEntries: PendingEntry[];
  objectUrls: Map<string, string[]>;
  flushing: boolean;
}

// Feedback tab data. Server list plus an IndexedDB pending queue merged into
// one BehaviorSubject per author. Writes go to the queue first, then POST
// /api/feedback (relative URL, same origin via the dev proxy); see
// dashboard/server/feedback-api.js for the write side of the contract.
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private http = inject(HttpClient);

  private onlineSubject = new BehaviorSubject<boolean>(true);
  readonly online$: Observable<boolean> = this.onlineSubject.asObservable();

  private state = new Map<FeedbackAuthor, AuthorState>(
    AUTHORS.map((author) => [author, {
      entries: new BehaviorSubject<FeedbackEntry[]>([]),
      serverEntries: [],
      pendingEntries: [],
      objectUrls: new Map<string, string[]>(),
      flushing: false,
    }]),
  );

  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    window.addEventListener('online', () => {
      for (const author of AUTHORS) void this.flush(author);
    });
  }

  entries$(author: FeedbackAuthor): Observable<FeedbackEntry[]> {
    return this.getState(author).entries.asObservable();
  }

  refresh(author: FeedbackAuthor): void {
    const st = this.getState(author);
    this.http.get<{ entries: FeedbackEntry[] }>(`/api/feedback?author=${author}`).pipe(
      timeout(8000),
      catchError(() => of(null)),
    ).subscribe((res) => {
      if (res) {
        st.serverEntries = res.entries;
        this.setOnline(true);
        try {
          localStorage.setItem(`shadow.feedback.cache.${author}`, JSON.stringify(res.entries));
        } catch { /* storage unavailable, keep going in memory only */ }
      } else {
        this.setOnline(false);
        st.serverEntries = this.readCache(author);
      }
      void this.reloadPending(author).then(() => {
        if (st.pendingEntries.length > 0) void this.flush(author);
      });
    });
  }

  checkHealth(): void {
    this.http.get<{ ok: boolean }>('/api/feedback/health').pipe(
      timeout(3000),
      catchError(() => of(null)),
    ).subscribe((res) => this.setOnline(!!res?.ok));
  }

  async submit(author: FeedbackAuthor, text: string, files: File[]): Promise<void> {
    const trimmed = text.trim();
    const finalText = trimmed || (files.length ? '(image)' : '');
    if (!finalText) return;

    const images: PendingImage[] = [];
    for (const file of files) {
      images.push(await this.prepareImage(file));
    }

    const entry: PendingEntry = {
      id: this.generateId(),
      author,
      created: this.localIsoString(),
      text: finalText,
      images,
    };
    await putPending(entry);

    const st = this.getState(author);
    st.pendingEntries.push(entry);
    this.emit(author);
    this.updateTimer();

    await this.flush(author);
  }

  private getState(author: FeedbackAuthor): AuthorState {
    return this.state.get(author) as AuthorState;
  }

  private setOnline(value: boolean): void {
    if (this.onlineSubject.value !== value) this.onlineSubject.next(value);
    this.updateTimer();
  }

  private readCache(author: FeedbackAuthor): FeedbackEntry[] {
    try {
      const raw = localStorage.getItem(`shadow.feedback.cache.${author}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private async reloadPending(author: FeedbackAuthor): Promise<void> {
    const st = this.getState(author);
    st.pendingEntries = await allPending(author);
    this.emit(author);
    this.updateTimer();
  }

  private async flush(author: FeedbackAuthor): Promise<void> {
    const st = this.getState(author);
    if (st.flushing) return;
    st.flushing = true;
    try {
      const ordered = [...st.pendingEntries].sort(
        (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
      );
      for (const entry of ordered) {
        const images = await Promise.all(entry.images.map(async (img) => ({
          name: img.name,
          type: img.type,
          dataBase64: await this.blobToBase64(img.blob),
        })));
        const body = { id: entry.id, author: entry.author, created: entry.created, text: entry.text, images };
        try {
          const res = await firstValueFrom(
            this.http.post<{ entry?: FeedbackEntry } & Partial<FeedbackEntry>>('/api/feedback', body),
          );
          // Contract is { entry }, but tolerate a bare entry so a shape drift
          // on the API never strands a pending entry on the device.
          const saved: FeedbackEntry = (res.entry ?? (res as FeedbackEntry));
          await deletePending(entry.id);
          this.revokeUrls(entry.id, st);
          st.pendingEntries = st.pendingEntries.filter((e) => e.id !== entry.id);
          st.serverEntries = [...st.serverEntries.filter((e) => e.id !== saved.id), saved];
          this.onlineSubject.next(true);
        } catch {
          this.onlineSubject.next(false);
          break;
        }
      }
    } finally {
      this.emit(author);
      st.flushing = false;
      this.updateTimer();
    }
  }

  private emit(author: FeedbackAuthor): void {
    const st = this.getState(author);
    const pendingAsEntries: FeedbackEntry[] = st.pendingEntries.map((p) => ({
      id: p.id,
      author: p.author,
      created: p.created,
      status: 'PENDING',
      text: p.text,
      images: [],
      ticket: null,
      resolved: null,
      resolvedAt: null,
      pending: true,
      localImageUrls: this.buildLocalUrls(p, st),
    }));
    const merged = [...st.serverEntries, ...pendingAsEntries].sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
    );
    st.entries.next(merged);
  }

  private buildLocalUrls(entry: PendingEntry, st: AuthorState): string[] {
    let urls = st.objectUrls.get(entry.id);
    if (!urls) {
      urls = entry.images.map((img) => URL.createObjectURL(img.blob));
      st.objectUrls.set(entry.id, urls);
    }
    return urls;
  }

  private revokeUrls(id: string, st: AuthorState): void {
    const urls = st.objectUrls.get(id);
    if (!urls) return;
    urls.forEach((u) => URL.revokeObjectURL(u));
    st.objectUrls.delete(id);
  }

  private updateTimer(): void {
    const anyPending = AUTHORS.some((a) => this.getState(a).pendingEntries.length > 0);
    const shouldRun = anyPending || !this.onlineSubject.value;
    if (shouldRun && this.intervalId === null) {
      this.intervalId = setInterval(() => {
        this.checkHealth();
        for (const a of AUTHORS) void this.flush(a);
      }, FLUSH_INTERVAL_MS);
    } else if (!shouldRun && this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private generateId(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${date}-${time}-${this.randomBase36(4)}`;
  }

  private randomBase36(len: number): string {
    let s = '';
    while (s.length < len) s += Math.random().toString(36).slice(2);
    return s.slice(0, len);
  }

  // Date#toISOString() only emits UTC (a trailing "Z"); the vault contract
  // wants the local wall clock time with its own offset, built by hand.
  private localIsoString(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const offsetMin = -now.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
    return `${date}T${time}${offset}`;
  }

  private async prepareImage(file: File): Promise<PendingImage> {
    const needsDownscale = file.size > DOWNSCALE_THRESHOLD_BYTES || file.type === 'image/heic';
    if (!needsDownscale) return { name: file.name, type: file.type, blob: file };

    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (!blob) throw new Error('canvas encode failed');
      const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
      return { name, type: 'image/jpeg', blob };
    } catch {
      return { name: file.name, type: file.type, blob: file };
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const idx = result.indexOf(',');
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
}
