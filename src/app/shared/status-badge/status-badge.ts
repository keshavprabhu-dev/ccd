import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="status-badge" [ngClass]="statusClass">
      <ng-content></ng-content>
      {{ status }}
    </span>
    <span *ngIf="isDuplicate" class="status-badge status-duplicate"
          style="margin-top: 4px; display: block; text-align: center;">DUPLICATE</span>
  `,
})
export class StatusBadgeComponent {
  @Input() status = '';
  @Input() isDuplicate = false;

  get statusClass(): string {
    return 'status-' + (this.status || '').toLowerCase().split(' ').join('-');
  }
}
