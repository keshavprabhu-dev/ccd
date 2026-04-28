import { Component, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { App } from '../../app';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/stop-payments`;

interface StopPayment {
  id?: string;
  accountNumber: string;
  serialNumber: string;
  date: string;
  amount: number;
  reason: string;
  beneficiaryName: string;
  status?: string;
  // standard audit fields
  createdBy?: string;
  createdTimestamp?: string;
  modifiedBy?: string;
  modifiedTimestamp?: string;
  modifiedCount?: number;
  approvedBy?: string;
  approvedTimestamp?: string;
  authStatus?: string;        // null | 'U' | 'A'
  selected?: boolean;
  isDuplicate?: boolean;
}

interface StopStat {
  date: string;
  totalAmount: number;
  totalItems: number;
  records: StopPayment[];
}

@Component({
  selector: 'app-stop-payments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stop-payments.html',
  styleUrl: './stop-payments.css',
})
export class StopPayments implements OnInit {
  private app = inject(App);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  get currentUser(): string {
    const user = this.app.currentUser();
    return user ? user.username : 'System User';
  }

  // ── State ──────────────────────────────────────────────────────────────────
  allRecords: StopPayment[] = [];
  filteredRecords: StopPayment[] = [];
  isLoading = false;
  isSaving = false;
  toastMessage: string | null = null;
  showFormModal = false;

  // ── Pagination ──────────────────────────────────────────────────────────────
  currentPage = 1;
  pageSize = 10;

  get paginatedRecords(): StopPayment[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredRecords.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredRecords.length / this.pageSize) || 1;
  }

  prevPage() { if (this.currentPage > 1) this.currentPage--; }
  nextPage() { if (this.currentPage < this.totalPages) this.currentPage++; }

  // ── Search ─────────────────────────────────────────────────────────────────
  searchAccountNumber = '';
  searchSerialNumber = '';
  showFilters = false;

  filters = {
    accountNumber: '',
    serialNumber: '',
    date: '',
    amount: '',
    reason: '',
    beneficiaryName: '',
    status: '',
  };

  applyFilters() {
    const f = this.filters;
    this.filteredRecords = this.allRecords.filter(r => {
      const matchAccount = r.accountNumber.toLowerCase().includes(f.accountNumber.toLowerCase());
      const matchSerial  = r.serialNumber.toLowerCase().includes(f.serialNumber.toLowerCase());
      const matchDate    = r.date.includes(f.date);
      const matchAmount  = f.amount ? r.amount.toString().includes(f.amount) : true;
      const matchReason  = r.reason.toLowerCase().includes(f.reason.toLowerCase());
      const matchBeneficiary = r.beneficiaryName.toLowerCase().includes(f.beneficiaryName.toLowerCase());
      const matchStatus  = f.status ? (r.status || '').toLowerCase() === f.status.toLowerCase() : true;
      return matchAccount && matchSerial && matchDate && matchAmount && matchReason && matchBeneficiary && matchStatus;
    });
    this.currentPage = 1;
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
    if (!this.showFilters) {
      this.filters = { accountNumber: '', serialNumber: '', date: '', amount: '', reason: '', beneficiaryName: '', status: '' };
      this.applyFilters();
    }
  }

  // ── Stats (Header Table) ──────────────────────────────────────────────────
  stopStats: StopStat[] = [];
  showStatsModal = false;
  selectedStat: StopStat | null = null;

  calculateStats() {
    const grouped = new Map<string, { totalAmount: number, totalItems: number, records: StopPayment[] }>();
    this.allRecords.forEach(r => {
      const d = r.date || 'Unknown';
      const existing = grouped.get(d) || { totalAmount: 0, totalItems: 0, records: [] };
      existing.totalAmount += Number(r.amount || 0);
      existing.totalItems += 1;
      existing.records.push(r);
      grouped.set(d, existing);
    });
    this.stopStats = Array.from(grouped.entries()).map(([date, data]) => ({
      date,
      ...data
    })).sort((a, b) => b.date.localeCompare(a.date));
  }

  viewStatDetails(stat: StopStat) {
    this.selectedStat = stat;
    this.showStatsModal = true;
  }

  closeStatsModal() {
    this.showStatsModal = false;
    this.selectedStat = null;
  }

  // ── Load All ──────────────────────────────────────────────────────────────
  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.isLoading = true;
    this.http.get<StopPayment[]>(API).subscribe({
      next: (data) => {
        this.allRecords = data;
        this.markDuplicates();
        this.applyFilters();
        this.calculateStats();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        console.error(err);
        this.showToast('⚠️ Could not connect to backend. Is the server running?');
        this.cdr.detectChanges();
      }
    });
  }

  markDuplicates() {
    const counts: { [key: string]: number } = {};
    (this.allRecords || []).forEach(r => {
      const key = `${r.accountNumber}_${r.serialNumber}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    (this.allRecords || []).forEach(r => {
      const key = `${r.accountNumber}_${r.serialNumber}`;
      r.isDuplicate = counts[key] > 1;
    });
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  selectedRecord: StopPayment | null = null;
  isFormEditable = true;

  newRecord: StopPayment = this.emptyRecord();

  emptyRecord(): StopPayment {
    return {
      accountNumber: '', serialNumber: '', date: '', amount: 0, reason: '',
      beneficiaryName: '',
      status: 'STOP'
    };
  }

  selectRecord(r: StopPayment) {
    this.selectedRecord = r;
    this.newRecord = { ...r };
    this.isFormEditable = false;
    this.showFormModal = true;
  }

  startNew() {
    this.selectedRecord = null;
    this.newRecord = this.emptyRecord();
    this.isFormEditable = true;
    this.showFormModal = true;
  }

  closeFormModal() {
    this.showFormModal = false;
    this.selectedRecord = null;
  }

  unlockForm() {
    this.isFormEditable = true;
  }

  cancelEdit() {
    if (this.selectedRecord) {
      this.newRecord = { ...this.selectedRecord };
      this.isFormEditable = false;
    } else {
      this.showFormModal = false;
    }
  }

  isFormValid(): boolean {
    const v = this.newRecord;
    const isValid = !!(
      v.accountNumber?.trim() &&
      v.serialNumber?.trim() &&
      v.date?.trim() &&
      v.beneficiaryName?.trim() &&
      v.amount > 0
    );
    return isValid;
  }

  submitForm() {
    console.log('Submitting Stop Payment:', this.newRecord);
    if (!this.isFormValid()) {
      console.warn('Form validation failed:', this.newRecord);
      this.showToast('⚠️ Please fill out all required fields correctly.');
      return;
    }
    this.isSaving = true;
    const now = new Date().toISOString();

    if (this.selectedRecord?.id) {
      // UPDATE
      const updated: StopPayment = {
        ...this.newRecord,
        modifiedBy: this.currentUser,
        modifiedTimestamp: now,
      };
      this.http.put<StopPayment>(`${API}/${this.selectedRecord.id}`, updated).subscribe({
        next: (saved) => {
          const idx = this.allRecords.findIndex(r => r.id === saved.id);
          if (idx > -1) this.allRecords[idx] = saved;
          this.selectedRecord = saved;
          this.newRecord = { ...saved };
          this.markDuplicates();
          this.applyFilters();
          this.isFormEditable = false;
          this.isSaving = false;
          this.showFormModal = false;
          this.showToast('Stop payment updated successfully.');
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isSaving = false;
          console.error('Update Error:', err);
          this.showToast('⚠️ Failed to update record — Internal Server Error.');
          this.cdr.detectChanges();
        }
      });
    } else {
      // CREATE
      const created: StopPayment = {
        ...this.newRecord,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        createdBy: this.currentUser,
        createdTimestamp: now,
        status: 'STOP',
      };
      this.http.post<StopPayment>(API, created).subscribe({
        next: (saved) => {
          this.allRecords.unshift(saved);
          this.markDuplicates();
          this.calculateStats();
          this.applyFilters();
          this.isFormEditable = false;
          this.isSaving = false;
          this.showFormModal = false;
          this.showToast('New stop payment record created. Duplicate check applied.');
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isSaving = false;
          console.error('Create Error:', err);
          this.showToast('⚠️ Failed to create record — API endpoint exception.');
          this.cdr.detectChanges();
        }
      });
    }
  }

  deleteRecord(r: StopPayment) {
    if (!r.id) return;
    if (!confirm(`Remove stop payment for check #${r.serialNumber}?`)) return;
    this.http.delete(`${API}/${r.id}`).subscribe({
      next: () => {
        this.allRecords = this.allRecords.filter(x => x.id !== r.id);
        if (this.selectedRecord?.id === r.id) this.startNew();
        this.calculateStats();
        this.applyFilters();
        this.showToast('Stop payment removed.');
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.showToast('⚠️ Failed to delete record.');
        this.cdr.detectChanges();
      }
    });
  }

  getStatusClass(status?: string): string {
    switch ((status || '').toUpperCase()) {
      case 'STOP':     return 'status-stop';
      case 'RELEASED': return 'status-released';
      default:         return 'status-new';
    }
  }

  showToast(msg: string) {
    this.toastMessage = msg;
    this.cdr.detectChanges();
    setTimeout(() => { this.toastMessage = null; this.cdr.detectChanges(); }, 3500);
  }

  formatAmount(v: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
  }
}
