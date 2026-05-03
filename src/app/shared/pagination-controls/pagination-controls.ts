import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pagination-controls">
      <button class="btn-outline" (click)="prev.emit()" [disabled]="currentPage === 1">Previous</button>
      <div class="page-info">Page {{ currentPage }} of {{ totalPages }}</div>
      <button class="btn-outline" (click)="next.emit()" [disabled]="currentPage === totalPages">Next</button>
    </div>
  `,
})
export class PaginationComponent {
  @Input() currentPage = 1;
  @Input() totalPages = 1;
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
}
