import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);

  private timer: ReturnType<typeof setTimeout> | null = null;

  show(message: string, durationMs = 3500) {
    if (this.timer) clearTimeout(this.timer);
    this.message.set(message);
    this.timer = setTimeout(() => this.message.set(null), durationMs);
  }

  clear() {
    if (this.timer) clearTimeout(this.timer);
    this.message.set(null);
  }
}
