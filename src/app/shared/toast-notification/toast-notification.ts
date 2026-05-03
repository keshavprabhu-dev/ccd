import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-message" *ngIf="toast.message()">
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"
           style="margin-right: 0.5rem; vertical-align: middle;">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
      {{ toast.message() }}
    </div>
  `,
})
export class ToastComponent {
  readonly toast = inject(ToastService);
}
