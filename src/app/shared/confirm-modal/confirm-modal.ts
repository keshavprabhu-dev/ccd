import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-modal.html',
  styles: [`
    .confirm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.52);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      z-index: 1700;
    }

    .confirm-shell {
      width: min(520px, 100%);
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
      overflow: hidden;
    }

    .confirm-header {
      padding: 20px 24px 12px;
      border-bottom: 1px solid #e2e8f0;
      background: linear-gradient(180deg, #fff7f7 0%, #fff 100%);
    }

    .confirm-title {
      margin: 0;
      color: #7f1d1d;
      font-size: 1.15rem;
      font-weight: 700;
    }

    .confirm-body {
      padding: 20px 24px;
      color: #475569;
      line-height: 1.55;
    }

    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 0 24px 24px;
    }

    .confirm-cancel,
    .confirm-approve {
      min-width: 96px;
      border-radius: 8px;
      padding: 10px 16px;
      font-weight: 600;
      cursor: pointer;
    }

    .confirm-cancel {
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #334155;
    }

    .confirm-approve {
      border: 1px solid #b91c1c;
      background: #dc2626;
      color: #ffffff;
    }

    .confirm-cancel:hover {
      background: #f8fafc;
    }

    .confirm-approve:hover {
      background: #b91c1c;
      border-color: #991b1b;
    }
  `]
})
export class ConfirmModalComponent {
  @Input() visible = false;
  @Input() title = 'Confirm Action';
  @Input() message = '';
  @Input() confirmLabel = 'Yes';
  @Input() cancelLabel = 'No';
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
