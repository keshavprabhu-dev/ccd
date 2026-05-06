import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface FilePreviewColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  format?: 'text' | 'date' | 'number';
}

@Component({
  selector: 'app-file-preview-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-preview-modal.html',
  styles: [`
    .preview-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.52);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      z-index: 1600;
    }

    .preview-shell {
      width: min(1080px, 100%);
      max-height: 88vh;
      background: #ffffff;
      border: 1px solid #dbe3ee;
      border-radius: 8px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .preview-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 20px 24px 16px;
      border-bottom: 1px solid #e2e8f0;
      background: linear-gradient(180deg, #f8fbff 0%, #f3f7fb 100%);
    }

    .preview-title {
      margin: 0;
      color: #0f172a;
      font-size: 1.2rem;
      font-weight: 700;
    }

    .preview-subtitle {
      margin: 6px 0 0;
      color: #475569;
      font-size: 0.92rem;
    }

    .preview-close {
      width: 36px;
      height: 36px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      color: #475569;
      cursor: pointer;
      font-size: 1.2rem;
      line-height: 1;
    }

    .preview-close:hover {
      border-color: #1d4ed8;
      color: #1d4ed8;
    }

    .preview-metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      padding: 16px 24px;
      border-bottom: 1px solid #e2e8f0;
      background: #fff;
    }

    .metric {
      padding: 12px 14px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
    }

    .metric-label {
      color: #64748b;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .metric-value {
      margin-top: 6px;
      color: #0f172a;
      font-size: 0.98rem;
      font-weight: 600;
    }

    .preview-table-wrap {
      flex: 1;
      overflow: auto;
      padding: 0 24px 24px;
      background: #fff;
    }

    .preview-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 760px;
    }

    .preview-table th,
    .preview-table td {
      padding: 12px 14px;
      border-bottom: 1px solid #e2e8f0;
      text-align: left;
      color: #334155;
      font-size: 0.92rem;
      white-space: nowrap;
    }

    .preview-table th {
      position: sticky;
      top: 0;
      background: #f8fafc;
      z-index: 1;
      color: #0f172a;
      font-weight: 700;
    }

    .preview-table td.align-right,
    .preview-table th.align-right {
      text-align: right;
    }

    .preview-empty {
      padding: 48px 16px;
      text-align: center;
      color: #64748b;
    }

    .preview-footer {
      display: flex;
      justify-content: flex-end;
      padding: 16px 24px 24px;
      background: #fff;
      border-top: 1px solid #e2e8f0;
    }

    .preview-action {
      border: 1px solid #1e3a8a;
      background: #1e3a8a;
      color: #fff;
      border-radius: 8px;
      padding: 10px 16px;
      font-weight: 600;
      cursor: pointer;
    }

    @media (max-width: 720px) {
      .preview-overlay {
        padding: 12px;
      }

      .preview-header,
      .preview-metrics,
      .preview-table-wrap,
      .preview-footer {
        padding-left: 16px;
        padding-right: 16px;
      }

      .preview-metrics {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class FilePreviewModalComponent {
  @Input() visible = false;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() uploadedLabel = '';
  @Input() recordCount = 0;
  @Input() statusLabel = '';
  @Input() records: any[] = [];
  @Input() columns: FilePreviewColumn[] = [];
  @Output() dismiss = new EventEmitter<void>();

  formatValue(record: any, column: FilePreviewColumn): string {
    const value = record[column.key];
    if (value == null || value === '') return '-';

    if (column.format === 'date') {
      const parsedDate = new Date(String(value));
      return Number.isNaN(parsedDate.getTime())
        ? String(value)
        : new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit'
          }).format(parsedDate);
    }

    if (column.format === 'number') {
      const numericValue = Number(value);
      return Number.isFinite(numericValue)
        ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numericValue)
        : String(value);
    }

    if (column.key === 'sourceType') {
      return value === 'CSV_UPLOAD' ? 'CSV Upload' : value === 'MANUAL' ? 'Manual' : String(value);
    }

    return String(value);
  }
}
