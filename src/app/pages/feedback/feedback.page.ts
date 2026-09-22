import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { FeedbackService } from '../../services/feedback.service';
import { mergedRouteData } from '../../services/route-data';
import {
  FEEDBACK_AUTHOR_NAMES,
  FEEDBACK_STATUS_LABELS,
  FeedbackAuthor,
  FeedbackEntry,
} from '../../services/feedback.model';

interface StagedAttachment {
  file: File;
  url: string;
}

@Component({
  selector: 'app-feedback',
  templateUrl: './feedback.page.html',
  styleUrls: ['./feedback.page.scss'],
  standalone: false,
})
export class FeedbackPage implements OnInit, OnDestroy, ViewWillEnter {
  @ViewChild('feedbackEnd') feedbackEnd!: ElementRef<HTMLDivElement>;
  @ViewChild('textareaEl') textareaEl!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private route = inject(ActivatedRoute);
  private feedbackService = inject(FeedbackService);

  readonly author = (mergedRouteData(this.route)['feedbackAuthor'] as FeedbackAuthor) ?? 'tom';
  readonly authorName = FEEDBACK_AUTHOR_NAMES[this.author];
  readonly statusLabels = FEEDBACK_STATUS_LABELS;

  readonly online$ = this.feedbackService.online$;

  entries: FeedbackEntry[] = [];
  inputText = '';
  staged: StagedAttachment[] = [];

  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.subs.push(
      this.feedbackService.entries$(this.author).subscribe((entries) => {
        this.entries = entries;
        setTimeout(() => this.scrollToBottom(), 50);
      }),
    );
  }

  ionViewWillEnter(): void {
    this.feedbackService.refresh(this.author);
    this.feedbackService.checkHealth();
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.staged.forEach((s) => URL.revokeObjectURL(s.url));
  }

  get canSend(): boolean {
    return this.inputText.trim().length > 0 || this.staged.length > 0;
  }

  thumbsFor(entry: FeedbackEntry): string[] {
    return entry.pending ? (entry.localImageUrls ?? []) : entry.images;
  }

  ticketIcon(ticket: string): string {
    return ticket.includes('github.com') ? 'logo-github' : 'link-outline';
  }

  statusClass(status: string): string {
    return `status-chip--${status.toLowerCase()}`;
  }

  trackById(_index: number, entry: FeedbackEntry): string {
    return entry.id;
  }

  openImage(url: string): void {
    window.open(url, '_blank');
  }

  onAttachClick(): void {
    this.fileInput.nativeElement.click();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    this.addFiles(files);
    input.value = '';
  }

  onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length) this.addFiles(files);
  }

  removeStaged(index: number): void {
    const [removed] = this.staged.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.url);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    if (finePointer) {
      event.preventDefault();
      void this.send();
    }
    // Touch devices: Enter inserts a newline, Send submits.
  }

  onInput(): void {
    this.autoGrow();
  }

  async send(): Promise<void> {
    if (!this.canSend) return;
    const files = this.staged.map((s) => s.file);
    const text = this.inputText;

    this.staged.forEach((s) => URL.revokeObjectURL(s.url));
    this.staged = [];
    this.inputText = '';
    this.autoGrow();

    await this.feedbackService.submit(this.author, text, files);
  }

  private addFiles(files: File[]): void {
    for (const file of files) {
      this.staged.push({ file, url: URL.createObjectURL(file) });
    }
  }

  private autoGrow(): void {
    const el = this.textareaEl?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  private scrollToBottom(): void {
    if (this.feedbackEnd) {
      this.feedbackEnd.nativeElement.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
