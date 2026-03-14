import { Component, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { App } from '../../app';

const API = 'http://localhost:3000/api/stop-payments';

interface StopPayment {
  id?: string;
  accountNumber: string;
  serialNumber: string;
  date: string;
  amount: number;
  reason: string;
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
      const matchStatus  = f.status ? (r.status || '').toLowerCase() === f.status.toLowerCase() : true;
      return matchAccount && matchSerial && matchDate && matchAmount && matchReason && matchStatus;
    });
    this.currentPage = 1;
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
    if (!this.showFilters) {
      this.filters = { accountNumber: '', serialNumber: '', date: '', amount: '', reason: '', status: '' };
      this.applyFilters();
    }
  }

  // ── Quick Search (search bar at top) ───────────────────────────────────────
  quickSearchAccount = '';
  quickSearchSerial = '';
  searchResult: StopPayment | null = null;
  searchPerformed = false;

  runQuickSearch() {
    if (!this.quickSearchAccount && !this.quickSearchSerial) return;
    this.isLoading = true;
    this.searchPerformed = false;
    this.searchResult = null;

    let params = new HttpParams();
    if (this.quickSearchAccount) params = params.set('accountNumber', this.quickSearchAccount);
    if (this.quickSearchSerial)  params = params.set('serialNumber',  this.quickSearchSerial);

    this.http.get<StopPayment[]>(API, { params }).subscribe({
      next: (results) => {
        this.searchPerformed = true;
        this.isLoading = false;
        if (results.length > 0) {
          this.searchResult = results[0];
          this.showToast(`Found ${results.length} matching stop payment(s).`);
        } else {
          this.showToast('No stop payment found for those criteria.');
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        console.error(err);
        this.showToast('⚠️ Could not connect to backend.');
        this.cdr.detectChanges();
      }
    });
  }

  clearSearch() {
    this.quickSearchAccount = '';
    this.quickSearchSerial = '';
    this.searchResult = null;
    this.searchPerformed = false;
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
        this.applyFilters();
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

  // ── Form ──────────────────────────────────────────────────────────────────
  selectedRecord: StopPayment | null = null;
  isFormEditable = true;

  newRecord: StopPayment = this.emptyRecord();

  emptyRecord(): StopPayment {
    return {
      accountNumber: '', serialNumber: '', date: '', amount: 0, reason: '',
      status: 'ACTIVE'
    };
  }

  selectRecord(r: StopPayment) {
    this.selectedRecord = r;
    this.newRecord = { ...r };
    this.isFormEditable = false;
    this.searchResult = null;
  }

  startNew() {
    this.selectedRecord = null;
    this.newRecord = this.emptyRecord();
    this.isFormEditable = true;
  }

  unlockForm() {
    this.isFormEditable = true;
  }

  cancelEdit() {
    if (this.selectedRecord) {
      this.newRecord = { ...this.selectedRecord };
      this.isFormEditable = false;
    } else {
      this.startNew();
    }
  }

  isFormValid(): boolean {
    return (
      this.newRecord.accountNumber.trim() !== '' &&
      this.newRecord.serialNumber.trim() !== '' &&
      this.newRecord.date.trim() !== '' &&
      this.newRecord.amount > 0 &&
      this.newRecord.reason.trim() !== ''
    );
  }

  submitForm() {
    if (!this.isFormValid()) return;
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
          this.applyFilters();
          this.isFormEditable = false;
          this.isSaving = false;
          this.showToast('Stop payment updated successfully.');
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isSaving = false;
          console.error(err);
          this.showToast('⚠️ Failed to update record.');
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
        status: 'ACTIVE',
      };
      this.http.post<StopPayment>(API, created).subscribe({
        next: (saved) => {
          this.allRecords.unshift(saved);
          this.applyFilters();
          this.startNew();
          this.isSaving = false;
          this.showToast('Stop payment created successfully.');
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isSaving = false;
          console.error(err);
          this.showToast('⚠️ Failed to create record.');
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
        if (this.searchResult?.id === r.id) this.searchResult = null;
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
      case 'ACTIVE':   return 'status-active';
      case 'RELEASED': return 'status-released';
      case 'EXPIRED':  return 'status-expired';
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
