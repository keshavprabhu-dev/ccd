import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { App } from '../../app';
import { environment } from '../../../environments/environment.development';
import { ToastService } from '../../services/toast.service';
import { ToastComponent } from '../../shared/toast-notification/toast-notification';
import { PaginationComponent } from '../../shared/pagination-controls/pagination-controls';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge';
import { ErrorModalComponent } from '../../shared/error-modal/error-modal';

const API = environment.apiUrl;

interface CheckException {
  id: string;
  paymentId: string;
  iclItemId: string;
  exceptionType: string;
  severity: string;
  status: string;
  resolutionNotes?: string;
  resolvedBy?: string;
  resolvedTimestamp?: string;
  createdTimestamp: string;
  // joined
  AccountNumber?: string;
  SerialNumber?: string;
  PaidAmount?: number;
  matchStatus?: string;
  rawCheckNumber?: string;
  rawAmount?: number;
  effectiveCheckNumber?: string;
  effectiveAmount?: number;
  imageFrontPath?: string;
  imageBackPath?: string;
}

interface ICLFile {
  id: string;
  fileName: string;
  uploadDate: string;
  fileType?: string;
  totalCount?: number;
  totalAmount?: number;
}

interface EncodingCorrection {
  id: string;
  iclItemId: string;
  correctionType: 'SERIAL' | 'DOLLAR' | 'BOTH';
  originalCheckNumber?: string;
  correctedCheckNumber?: string;
  originalAmount?: number;
  correctedAmount?: number;
  reason?: string;
  status: 'PENDING' | 'APPLIED' | 'REJECTED';
  createdBy?: string;
  createdTimestamp?: string;
}

@Component({
  selector: 'app-check-processing',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastComponent, PaginationComponent, StatusBadgeComponent, ErrorModalComponent],
  templateUrl: './check-processing.html',
  styleUrl: './check-processing.css',
})
export class CheckProcessing implements OnInit {
  private http = inject(HttpClient);
  private app = inject(App);
  readonly toast = inject(ToastService);

  get currentUser(): string {
    return this.app.currentUser()?.username ?? 'System';
  }

  // ── State ───────────────────────────────────────────────────────────────────
  exceptions: CheckException[] = [];
  filteredExceptions: CheckException[] = [];
  iclFiles: ICLFile[] = [];
  pendingCorrections: EncodingCorrection[] = [];
  isLoading = false;
  showErrorModal = false;
  errorMessage = '';

  selectedTab: 'workbench' | 'icl-files' | 'corrections' = 'workbench';
  selectedException: CheckException | null = null;
  activeImageSide: 'front' | 'back' = 'front';

  // Filters
  showFilters = false;
  filters = { status: '', type: '', severity: '', account: '' };

  // Correction modal
  showCorrectionModal = false;
  correctionForm = {
    correctionType: 'SERIAL' as 'SERIAL' | 'DOLLAR' | 'BOTH',
    correctedCheckNumber: '',
    correctedAmount: null as number | null,
    reason: ''
  };
  isSavingCorrection = false;

  // Resolve modal
  showResolveModal = false;
  resolveNotes = '';
  isResolving = false;

  // Pagination
  currentPage = 1;
  pageSize = 15;

  get paginatedExceptions(): CheckException[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredExceptions.slice(start, start + this.pageSize);
  }
  get totalPages(): number {
    return Math.ceil(this.filteredExceptions.length / this.pageSize) || 1;
  }
  prevPage() { if (this.currentPage > 1) this.currentPage--; }
  nextPage() { if (this.currentPage < this.totalPages) this.currentPage++; }

  // Summary stats
  get openCount(): number   { return this.exceptions.filter(e => e.status === 'OPEN').length; }
  get highCount(): number   { return this.exceptions.filter(e => e.severity === 'HIGH' && e.status === 'OPEN').length; }
  get resolvedCount(): number { return this.exceptions.filter(e => e.status === 'RESOLVED').length; }
  get pendingCorrectionCount(): number { return this.pendingCorrections.filter(c => c.status === 'PENDING').length; }

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loadExceptions();
    this.loadICLFiles();
    this.loadCorrections();
  }

  loadExceptions() {
    this.isLoading = true;
    this.http.get<CheckException[]>(`${API}/check-exceptions`).subscribe({
      next: (data) => {
        this.exceptions = data;
        this.applyFilters();
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        this.toast.show('⚠️ Failed to load exceptions.');
        console.error(err);
      }
    });
  }

  loadICLFiles() {
    this.http.get<ICLFile[]>(`${API}/icl-parser/files`).subscribe({
      next: (data) => this.iclFiles = data,
      error: () => {}
    });
  }

  loadCorrections() {
    this.http.get<EncodingCorrection[]>(`${API}/corrections`).subscribe({
      next: (data) => this.pendingCorrections = data,
      error: () => {}
    });
  }

  applyFilters() {
    this.filteredExceptions = this.exceptions.filter(e => {
      const matchStatus   = !this.filters.status   || e.status === this.filters.status;
      const matchType     = !this.filters.type     || e.exceptionType === this.filters.type;
      const matchSeverity = !this.filters.severity || e.severity === this.filters.severity;
      const matchAccount  = !this.filters.account  || (e.AccountNumber || '').toLowerCase().includes(this.filters.account.toLowerCase());
      return matchStatus && matchType && matchSeverity && matchAccount;
    });
    this.currentPage = 1;
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
    if (!this.showFilters) {
      this.filters = { status: '', type: '', severity: '', account: '' };
      this.applyFilters();
    }
  }

  selectException(ex: CheckException) {
    this.selectedException = ex;
    this.activeImageSide = 'front';
  }

  getExceptionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      PAID_WITHOUT_ISSUANCE: 'Paid Without Issuance',
      AMOUNT_MISMATCH: 'Amount Mismatch',
      PAID_AFTER_STOP: 'Paid After Stop',
      SERIAL_MISMATCH: 'Serial Mismatch',
      SUPERSEDED: 'Superseded'
    };
    return labels[type] || type;
  }

  getSeverityClass(severity: string): string {
    const map: Record<string, string> = { HIGH: 'status-void', MEDIUM: 'status-pending', LOW: 'status-new' };
    return map[severity] || 'status-new';
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      OPEN: 'status-pending', RESOLVED: 'status-approved',
      ESCALATED: 'status-void', SUPERSEDED: 'status-imported'
    };
    return map[status] || 'status-new';
  }

  // ── Resolve exception ───────────────────────────────────────────────────────
  openResolveModal() {
    this.resolveNotes = '';
    this.showResolveModal = true;
  }

  confirmResolve() {
    if (!this.selectedException || !this.resolveNotes.trim()) return;
    this.isResolving = true;
    this.http.put(`${API}/check-exceptions/${this.selectedException.id}/resolve`, {
      resolutionNotes: this.resolveNotes,
      resolvedBy: this.currentUser
    }).subscribe({
      next: () => {
        this.toast.show('Exception resolved.');
        this.showResolveModal = false;
        this.selectedException = null;
        this.loadExceptions();
        this.isResolving = false;
      },
      error: () => {
        this.toast.show('⚠️ Failed to resolve exception.');
        this.isResolving = false;
      }
    });
  }

  // ── Encoding correction ─────────────────────────────────────────────────────
  openCorrectionModal() {
    if (!this.selectedException) return;
    this.correctionForm = {
      correctionType: 'SERIAL',
      correctedCheckNumber: this.selectedException.effectiveCheckNumber || '',
      correctedAmount: this.selectedException.effectiveAmount ?? null,
      reason: ''
    };
    this.showCorrectionModal = true;
  }

  submitCorrection() {
    if (!this.selectedException) return;
    if (!this.correctionForm.reason.trim()) {
      this.showErrorModal = true;
      this.errorMessage = '• Reason is required for encoding corrections.';
      return;
    }

    this.isSavingCorrection = true;
    this.http.post(`${API}/icl-items/${this.selectedException.iclItemId}/corrections`, {
      ...this.correctionForm,
      createdBy: this.currentUser
    }).subscribe({
      next: () => {
        this.toast.show('Correction submitted — pending supervisor approval.');
        this.showCorrectionModal = false;
        this.loadCorrections();
        this.isSavingCorrection = false;
      },
      error: (err) => {
        this.toast.show('⚠️ Failed to submit correction.');
        this.isSavingCorrection = false;
      }
    });
  }

  // ── Correction approval (Maker-Checker) ────────────────────────────────────
  approveCorrection(c: EncodingCorrection) {
    this.http.post(`${API}/corrections/${c.id}/approve`, { approvedBy: this.currentUser }).subscribe({
      next: (result: any) => {
        this.toast.show('Correction approved and applied. Re-matching complete.');
        this.loadAll();
      },
      error: (err) => {
        this.toast.show('⚠️ ' + (err.error?.error || 'Approval failed.'));
      }
    });
  }

  rejectCorrection(c: EncodingCorrection) {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    this.http.post(`${API}/corrections/${c.id}/reject`, { rejectedBy: this.currentUser, reason }).subscribe({
      next: () => {
        this.toast.show('Correction rejected.');
        this.loadCorrections();
      },
      error: () => this.toast.show('⚠️ Rejection failed.')
    });
  }

  closeErrorModal() {
    this.showErrorModal = false;
  }
}
