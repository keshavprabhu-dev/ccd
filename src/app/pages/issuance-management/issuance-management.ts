import { Component, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { App } from '../../app';
import { environment } from '../../../environments/environment.development';
import { CurrencyService } from '../../services/currency.service';
import { ToastService } from '../../services/toast.service';
import { AuditTrailComponent } from '../../shared/audit-trail/audit-trail';
import { ErrorModalComponent } from '../../shared/error-modal/error-modal';
import { ToastComponent } from '../../shared/toast-notification/toast-notification';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge';
import { FilePreviewColumn, FilePreviewModalComponent } from '../../shared/file-preview-modal/file-preview-modal';
import { ConfirmModalComponent } from '../../shared/confirm-modal/confirm-modal';

const API = `${environment.apiUrl}/issuance`;

interface RecordHistoryEvent {
  timestamp: string;
  action: string;
  previousState: string;
  newState: string;
  actor: string;
}

interface UploadHistory {
  id: string;
  fileName: string;
  uploadDate: string;
  fileStatus: string;
  records: IssuanceRecord[];
}

interface IssuanceRecord {
  id?: string;
  date: string;
  serialNumber: string;
  accountNumber: string;
  beneficiaryName: string;
  beneficiaryAddressLine1?: string;
  beneficiaryAddressLine2?: string;
  beneficiaryTownName?: string;
  beneficiaryStateCode?: string;
  beneficiaryCountryCode?: string;
  currencyCode?: string;
  sourceType?: 'MANUAL' | 'CSV_UPLOAD';
  remarks?: string;
  amount: number;
  // standard audit fields
  createdBy?: string;
  createdTimestamp?: string;
  modifiedBy?: string;
  modifiedTimestamp?: string;
  modifiedCount?: number;
  approvedBy?: string;
  approvedTimestamp?: string;
  authStatus?: string;        // null | 'U' | 'A'
  recordStatus?: string;
  previousStatus?: string;
  fileId?: string;
  selected?: boolean;
  isDuplicate?: boolean;
  historyList?: RecordHistoryEvent[];
}

@Component({
  selector: 'app-issuance-management',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, AuditTrailComponent, ErrorModalComponent, ToastComponent, StatusBadgeComponent, FilePreviewModalComponent, ConfirmModalComponent],
  templateUrl: './issuance-management.html',
  styleUrl: './issuance-management.css',
})
export class IssuanceManagement implements OnInit {
  private app = inject(App);
  private http = inject(HttpClient);
  private currencyService = inject(CurrencyService);
  readonly toast = inject(ToastService);

  // Account Search Modal State
  showAccountSearchModal = false;
  accountSearchQuery = '';
  mockAccounts = [
    { accountNumber: '1000123456', accountName: 'Corporate Checking' },
    { accountNumber: '1000987654', accountName: 'Payroll Account' },
    { accountNumber: '2000111222', accountName: 'Vendor Payments' },
    { accountNumber: '3000555666', accountName: 'Tax Reserve' },
    { accountNumber: '4000888999', accountName: 'Operations Main' }
  ];
  filteredAccounts = [...this.mockAccounts];

  get currentUser(): string {
    const user = this.app.currentUser();
    return user ? user.username : 'System User';
  }

  allRecords: IssuanceRecord[] = [];
  filteredRecords: IssuanceRecord[] = [];
  availableCurrencies: any[] = [];
  isLoading: boolean = false;
  showFormModal: boolean = false;
  showErrorModal: boolean = false;
  errorMessage: string = '';

  ngOnInit() {
    this.loadFromApi();
    this.currencyService.currencies$.subscribe({
      next: (data) => this.availableCurrencies = data,
      error: (err) => console.error('Failed to load currencies', err)
    });
  }

  // ── API helpers ────────────────────────────────────────────────────────────

  /** Load all files (with their records) from the backend, plus any manually-entered
   *  records that were saved without a file_id ("orphaned" records). */
  loadFromApi() {
    this.isLoading = true;
    this.http.get<any[]>(`${API}/files`).subscribe({
      next: (files) => {
        this.historicalFiles = files.map(f => ({
          id: f.id,
          fileName: f.fileName,
          uploadDate: f.uploadDate,
          fileStatus: f.fileStatus,
          records: (f.records || []).map((r: any) => this.normalizeRecordFromApi(r))
        }));

        // Collect all file-linked records (de-duped by id)
        const seen = new Set<string>();
        const merged: IssuanceRecord[] = [];
        this.historicalFiles.forEach(hf => {
          hf.records.forEach(r => {
            if (r.id && !seen.has(r.id)) {
              seen.add(r.id);
              merged.push(r);
            }
          });
        });

        // Also fetch orphaned records (manually-entered, no file_id)
        this.http.get<IssuanceRecord[]>(`${API}/records?orphaned=true`).subscribe({
          next: (orphans) => {
            orphans.forEach(r => {
              const normalized = this.normalizeRecordFromApi(r);
              if (normalized.id && !seen.has(normalized.id)) {
                seen.add(normalized.id);
                merged.push(normalized);
              }
            });
            this.allRecords = merged;
            this.markDuplicates();
            this.isLoading = false;
            this.applyFilters();
            this.cdr.detectChanges();
          },
          error: () => {
            // Orphaned fetch failed — still show the file-linked records
            this.allRecords = merged;
            this.markDuplicates();
            this.isLoading = false;
            this.applyFilters();
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        this.isLoading = false;
        console.error('Failed to load from API:', err);
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

  private normalizeRecordFromApi(record: any): IssuanceRecord {
    return {
      ...record,
      date: record.date || record.Date || '',
      serialNumber: record.serialNumber || record.SerialNumber || '',
      accountNumber: record.accountNumber || record.AccountNumber || '',
      beneficiaryName: record.beneficiaryName || record.BeneficiaryName || '',
      beneficiaryAddressLine1: record.beneficiaryAddressLine1 || record.beneficiaryAddress || '',
      amount: Number(record.amount ?? record.Amount ?? 0),
      currencyCode: record.currencyCode || record.CurrencyCode || 'USD',
      sourceType: record.sourceType || 'MANUAL',
      recordStatus: record.recordStatus || record.RecordStatus || 'NEW',
      historyList: Array.isArray(record.historyList) ? record.historyList : []
    };
  }

  /** Persist a single record update to the backend. */
  private saveRecord(record: IssuanceRecord, isNew: boolean = false) {
    if (!record.id) return;
    if (isNew) {
      this.http.post(`${API}/records`, record).subscribe({
        error: (err) => console.error('Failed to create record:', err)
      });
    } else {
      this.http.put(`${API}/records/${record.id}`, record).subscribe({
        error: (err) => console.error('Failed to save record:', err)
      });
    }
  }

  /** Physically delete a single record in the backend. */
  private deleteRecordFromApi(id: string) {
    this.http.delete(`${API}/records/${id}`).subscribe({
      error: (err) => console.error('Failed to delete record from API:', err)
    });
  }

  /** Delete a whole file (and cascade its records) in the backend. */
  private deleteFileFromApi(fileId: string) {
    this.http.delete(`${API}/files/${fileId}`).subscribe({
      error: (err) => console.error('Failed to delete file from API:', err)
    });
  }

  get newCount(): number {
    return this.allRecords.filter(r => r.recordStatus === 'NEW').length;
  }
  
  
  filters = {
    date: '',
    serialNumber: '',
    accountNumber: '',
    beneficiaryName: '',
    beneficiaryAddress: '',
    amount: '',
    currencyCode: '',
    sourceType: '',
    createdBy: '',
    createdTimestamp: '',
    modifiedBy: '',
    modifiedTimestamp: '',
    approvedBy: '',
    approvedTimestamp: '',
    modifiedCount: '',
    recordStatus: ''
  };

  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  toggleSort(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.applyFilters();
  }

  showFilters: boolean = false;

  toggleFilters() {
    this.showFilters = !this.showFilters;
    if (!this.showFilters) {
      this.filters = {
        date: '',
        serialNumber: '',
        accountNumber: '',
        beneficiaryName: '',
        beneficiaryAddress: '',
        amount: '',
        currencyCode: '',
        sourceType: '',
        createdBy: '',
        createdTimestamp: '',
        modifiedBy: '',
        modifiedTimestamp: '',
        approvedBy: '',
        approvedTimestamp: '',
        modifiedCount: '',
        recordStatus: ''
      };
      this.applyFilters();
    }
  }

  showColumnConfig: boolean = false;
  columns = {
    date: true,
    serialNumber: true,
    accountNumber: true,
    beneficiaryName: true,
    beneficiaryAddress: false,
    amount: true,
    currencyCode: true,
    sourceType: true,
    createdBy: false,
    createdTimestamp: false,
    modifiedBy: false,
    modifiedTimestamp: false,
    approvedBy: false,
    approvedTimestamp: false,
    modifiedCount: false
  };

  toggleColumnConfig() {
    this.showColumnConfig = !this.showColumnConfig;
  }

  // Form State
  newRecord: IssuanceRecord = this.getEmptyRecord();

  getEmptyRecord(): IssuanceRecord {
    return {
      date: '',
      serialNumber: '',
      accountNumber: '',
      beneficiaryName: '',
      beneficiaryAddressLine1: '',
      beneficiaryAddressLine2: '',
      beneficiaryTownName: '',
      beneficiaryStateCode: '',
      beneficiaryCountryCode: '',
      currencyCode: 'USD',
      sourceType: 'MANUAL',
      remarks: '',
      amount: 0,
      createdBy: '',
      createdTimestamp: '',
      modifiedCount: 0,
      recordStatus: 'NEW',
      historyList: [{
        timestamp: new Date().toISOString(),
        action: 'Created',
        previousState: 'NONE',
        newState: 'NEW',
        actor: this.currentUser
      }]
    };
  }

  selectedRecord: IssuanceRecord | null = null;
  isFormEditable: boolean = true;
  
  selectedAction: string = '';

  get availableActions(): string[] {
    const actions: string[] = [];
    if (!this.selectedRecord) return actions;
    
    const status = this.selectedRecord.recordStatus;
    
    if (status === 'NEW') {
      actions.push('Submit');
      actions.push('Delete');
    }
    
    if (status === 'PENDING') {
      if (this.canApprove(this.selectedRecord)) {
        actions.push('Approve');
      } else {
        actions.push('Revert');
      }
    }

    if (status === 'ISSUED') {
      actions.push('Void');
      actions.push('Delete');
    }

    if (status === 'VOID') {
      actions.push('Release Void');
      actions.push('Delete');
    }

    if (status === 'PENDING DELETION') {
      if (this.canApprove(this.selectedRecord)) {
        actions.push('Approve Delete');
      } else {
        actions.push('Revert Delete');
      }
    }

    return actions;
  }

  getStatusClass(status?: string): string {
    return 'status-' + (status || '').toLowerCase().split(' ').join('-');
  }

  executeDecision() {
    switch (this.selectedAction) {
      case 'Unlock': this.unlockForm(); break;
      case 'Submit': this.submitRecordFromLocked(); break;
      case 'Approve': this.approveRecordFromLocked(); break;
      case 'Revert': this.revertRecordFromLocked(); break;
      case 'Void': this.voidRecordFromLocked(); break;
      case 'Release Void': this.releaseVoidFromLocked(); break;
      case 'Delete': this.deleteRecord(); break;
      case 'Approve Delete': this.approveDeleteRecord(); break;
      case 'Revert Delete': this.revertDeleteFromLocked(); break;
    }
    this.selectedAction = '';
  }

  selectedFile: File | null = null;
  selectedFileName: string = '';
  isUploading: boolean = false;
  currentPage = 1;
  pageSize = 15;

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.selectedFileName = file.name;
    }
  }

  uploadFile() {
    if (this.selectedFile) {
      const isDuplicateFile = this.historicalFiles.some(
        h => h.fileName.toLowerCase() === this.selectedFileName.toLowerCase()
      );
      const allowDuplicate = !isDuplicateFile || confirm(
        `A file named "${this.selectedFileName}" has already been uploaded. Upload it again?`
      );
      if (!allowDuplicate) {
        this.clearSelectedFile();
        this.showToast('Upload cancelled. Duplicate file was not imported.');
        return;
      }

      this.isUploading = true;
      const fileReader = new FileReader();
      
      fileReader.onload = (e) => {
        const text = fileReader.result as string;
        
        setTimeout(() => {
          try {
            this.parseCSV(text, isDuplicateFile);
          } catch (error) {
            console.error('Error during CSV parsing:', error);
            this.showToast('Upload failed. The CSV could not be parsed.');
          } finally {
            this.clearSelectedFile();
            this.isUploading = false;
            this.cdr.detectChanges();
          }
        }, 800);
      };
      
      fileReader.onerror = (e) => {
        console.error('File reading error:', e);
        this.isUploading = false;
        this.cdr.detectChanges();
      };
      
      fileReader.readAsText(this.selectedFile);
    }
  }

  private clearSelectedFile() {
    this.selectedFile = null;
    this.selectedFileName = '';
    const fileInput = document.getElementById('fileUpload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }

  private parseCsvRows(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(value.trim());
        value = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') i++;
        row.push(value.trim());
        if (row.some(cell => cell !== '')) rows.push(row);
        row = [];
        value = '';
      } else {
        value += char;
      }
    }

    row.push(value.trim());
    if (row.some(cell => cell !== '')) rows.push(row);
    return rows;
  }

  parseCSV(text: string, overrideDuplicate = false) {
    const lines = this.parseCsvRows(text);
    if (lines.length > 0) {
      const newRecords: IssuanceRecord[] = [];
      // Start from 1 assuming there's a header: IssuedDate,IssuedSerialNumber,AccountNumber,Beneficiary,Amount
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i];
          if (parts.length >= 4) {
            const serialNumber = parts[1]?.trim() || '';
            const accountNumber = parts[2]?.trim() || '';
            
            let beneficiaryName = '';
            let amount = 0;
            let beneficiaryAddressLine1 = '';
            
            if (parts.length >= 5) {
              beneficiaryName = parts[3]?.trim() || '';
              amount = parseFloat(parts[4]) || 0;
              if (parts.length > 5) {
                beneficiaryAddressLine1 = parts[5]?.trim() || '';
              }
            } else {
              amount = parseFloat(parts[3]) || 0;
            }

            newRecords.push({
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
              date: parts[0]?.trim() || '',
              serialNumber: serialNumber,
              accountNumber: accountNumber,
              beneficiaryName: beneficiaryName,
              beneficiaryAddressLine1: beneficiaryAddressLine1,
              amount: amount,
              currencyCode: 'USD',
              sourceType: 'CSV_UPLOAD',
              createdBy: this.currentUser,
              createdTimestamp: new Date().toISOString(),
              modifiedCount: 0,
              recordStatus: 'NEW',
              historyList: [{
                timestamp: new Date().toISOString(),
                action: 'Imported',
                previousState: 'NONE',
                newState: 'NEW',
                actor: this.currentUser
              }]
            });
          }
      }
      if (newRecords.length > 0) {
        const newFile = {
          id: Date.now().toString(),
          fileName: this.selectedFileName || 'Imported Data',
          uploadDate: new Date().toISOString(),
          fileStatus: 'New',
          records: JSON.parse(JSON.stringify(newRecords)),
          override: overrideDuplicate
        };

        // Persist to backend first, then update local state on success
        this.http.post<any>(`${API}/files`, newFile).subscribe({
          next: () => {
            this.allRecords = [...newRecords, ...this.allRecords];
            this.markDuplicates(); // Mark duplicates after adding new records
            this.historicalFiles.unshift(newFile);
            if (this.historicalFiles.length > 10) {
              this.historicalFiles.pop();
            }
            this.activeHistoryId = newFile.id;
            this.applyFilters();
            this.loadHistoricalFile(newFile);
            this.showToast(`Imported ${newRecords.length} record(s) from "${newFile.fileName}".`);
          },
          error: (err) => {
            console.error('Failed to save file to API:', err);
            this.showToast('⚠️ Upload failed — Backend service exception. High priority.');
          }
        });
      }
    }
  }

  constructor(private cdr: ChangeDetectorRef) {
    this.applyFilters();
  }


  activeHistoryId: string | null = null;

  applyFilters() {
    let baseRecords = this.allRecords;
    if (this.activeHistoryId) {
      const hist = this.historicalFiles.find(h => h.id === this.activeHistoryId);
      if (hist) {
        const histIds = new Set(hist.records.map(r => r.id));
        baseRecords = baseRecords.filter(r => r.id && histIds.has(r.id));
      } else {
        this.activeHistoryId = null;
      }
    }

    this.filteredRecords = baseRecords.filter(record => {
      const matchDate = record.date.includes(this.filters.date);
      const matchSerial = record.serialNumber.toLowerCase().includes(this.filters.serialNumber.toLowerCase());
      const matchAccount = record.accountNumber.toLowerCase().includes(this.filters.accountNumber.toLowerCase());
      const matchBeneficiary = record.beneficiaryName.toLowerCase().includes(this.filters.beneficiaryName.toLowerCase());
      const matchAddress = record.beneficiaryAddressLine1 ? record.beneficiaryAddressLine1.toLowerCase().includes(this.filters.beneficiaryAddress.toLowerCase()) : true;
      const matchAmount = this.filters.amount ? record.amount.toString().includes(this.filters.amount) : true;
      const matchCurrency = (record.currencyCode || '').toLowerCase().includes(this.filters.currencyCode.toLowerCase());
      const matchSourceType = !this.filters.sourceType || (record.sourceType || '') === this.filters.sourceType;
      const matchCreatedBy = (record.createdBy || '').toLowerCase().includes(this.filters.createdBy.toLowerCase());
      const matchCreatedDate = (record.createdTimestamp || '').includes(this.filters.createdTimestamp);
      const matchModifiedBy = (record.modifiedBy || '').toLowerCase().includes(this.filters.modifiedBy.toLowerCase());
      const matchModifiedDate = (record.modifiedTimestamp || '').includes(this.filters.modifiedTimestamp);
      const matchApprovedBy = (record.approvedBy || '').toLowerCase().includes(this.filters.approvedBy.toLowerCase());
      const matchApprovedDate = (record.approvedTimestamp || '').includes(this.filters.approvedTimestamp);
      const matchModCount = this.filters.modifiedCount ? record.modifiedCount?.toString().includes(this.filters.modifiedCount) : true;
      const matchStatus = (record.recordStatus || '').toLowerCase().includes(this.filters.recordStatus.toLowerCase());
      
      return matchDate && matchSerial && matchAccount && matchBeneficiary && matchAddress && matchAmount && matchCurrency && matchSourceType && matchCreatedBy && matchCreatedDate && matchModifiedBy && matchModifiedDate && matchApprovedBy && matchApprovedDate && matchModCount && matchStatus;
    });

    if (this.sortColumn) {
      this.filteredRecords.sort((a: any, b: any) => {
        let valA = a[this.sortColumn];
        let valB = b[this.sortColumn];

        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }
    this.currentPage = Math.min(this.currentPage, this.totalPages);
  }

  get paginatedRecords(): IssuanceRecord[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredRecords.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredRecords.length / this.pageSize));
  }

  getSourceTypeLabel(sourceType?: string): string {
    return sourceType === 'CSV_UPLOAD' ? 'CSV Upload' : 'Manual';
  }

  prevPage() {
    if (this.currentPage > 1) this.currentPage--;
  }

  nextPage() {
    if (this.currentPage < this.totalPages) this.currentPage++;
  }

  downloadCsvTemplate() {
    const headers = [
      'IssuedDate',
      'SerialNumber',
      'AccountNumber',
      'BeneficiaryName',
      'Amount',
      'BeneficiaryAddressLine1'
    ];
    const sampleRow = [
      '2026-05-06',
      '100001',
      '1000123456',
      'Example Payee Inc',
      '1250.00',
      '123 Example Street'
    ];
    const csvContent = [headers.join(','), sampleRow.map(value => `"${value}"`).join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'issuance_upload_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  isFormValid(): boolean {
    return (
      (this.newRecord.date || '').trim() !== '' &&
      (this.newRecord.serialNumber || '').trim() !== '' &&
      (this.newRecord.accountNumber || '').trim() !== '' &&
      (this.newRecord.currencyCode || '').trim() !== '' &&
      this.newRecord.amount !== null &&
      this.newRecord.amount > 0
    );
  }

  selectRecord(record: IssuanceRecord) {
    this.selectedRecord = record;
    this.newRecord = { ...record };
    this.isFormEditable = false;
    this.showFormModal = true;
  }

  startNewRecord() {
    this.selectedRecord = null;
    this.newRecord = this.getEmptyRecord();
    this.isFormEditable = true;
    this.showFormModal = true;
  }

  closeFormModal() {
    this.showFormModal = false;
    this.selectedRecord = null; // Clear selection when closing
  }

  unlockForm() {
    this.isFormEditable = true;
  }

  cancelForm() {
    if (this.selectedRecord) {
      this.newRecord = { ...this.selectedRecord };
      this.isFormEditable = false;
    } else {
      this.showFormModal = false;
    }
  }

  exportRecords() {
    if (this.filteredRecords.length === 0) return;
    
    const headers = [
      'Issued Date', 'Serial Number', 'Account Number', 'Beneficiary', 'Address', 'Amount',
      'Created By', 'Created Timestamp', 'Modified By', 'Modified Timestamp',
      'Approved By', 'Approved Timestamp', 'Modified Count', 'Status'
    ];

    const csvLines = this.filteredRecords.map(r => {
      return [
        r.date, r.serialNumber, r.accountNumber, r.beneficiaryName, r.beneficiaryAddressLine1 || '', r.amount,
        r.createdBy || '', r.createdTimestamp || '', r.modifiedBy || '',
        r.modifiedTimestamp || '', r.approvedBy || '', r.approvedTimestamp || '',
        r.modifiedCount || 0, r.recordStatus || ''
      ].map(val => `"${val}"`).join(',');
    });

    const csvContent = [headers.join(','), ...csvLines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'issuance_records.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  get hasSelectedRecords(): boolean {
    return this.allRecords.some(r => r.selected);
  }

  get canBulkApprove(): boolean {
    const selected = this.allRecords.filter(r => r.selected);
    return selected.length > 0 && selected.every(r => this.canApprove(r));
  }

  selectedBulkAction: string = '';

  get hasPendingRecords(): boolean {
    return this.allRecords.some(r => r.recordStatus === 'PENDING');
  }

  get canExecuteBulkDecision(): boolean {
    if (!this.selectedBulkAction) return false;
    if (this.selectedBulkAction === 'APPROVE') return this.canBulkApprove;
    return this.hasSelectedRecords;
  }

  executeBulkDecision() {
    if (this.selectedBulkAction) {
      this.openBulkModal(this.selectedBulkAction as any);
      this.selectedBulkAction = '';
    }
  }

  toggleAllSelection(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.paginatedRecords.forEach(r => r.selected = checked);
  }

  showToast(message: string) {
    this.toast.show(message);
  }

  bulkModalVisible: boolean = false;
  bulkActionType: string | null = null;
  selectedBulkRecords: IssuanceRecord[] = [];

  logHistory(record: IssuanceRecord, action: string, previousState: string, newState: string) {
    if (!record.historyList) record.historyList = [];
    record.historyList.push({
      timestamp: new Date().toISOString(),
      action: action,
      previousState: previousState,
      newState: newState,
      actor: this.currentUser
    });
  }

  submitRecordFromLocked() {
    if (this.selectedRecord && this.selectedRecord.recordStatus === 'NEW') {
      const prev = this.selectedRecord.recordStatus || 'UNKNOWN';
      this.selectedRecord.recordStatus = 'PENDING';
      this.selectedRecord.modifiedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedBy = this.currentUser;
      this.selectedRecord.modifiedCount = (this.selectedRecord.modifiedCount || 0) + 1;
      this.logHistory(this.selectedRecord, 'Submit', prev, 'PENDING');
      this.saveRecord(this.selectedRecord);
      this.applyFilters();
    }
  }

  revertRecordFromLocked() {
    if (this.selectedRecord && this.selectedRecord.recordStatus === 'PENDING') {
      const prev = this.selectedRecord.recordStatus;
      this.selectedRecord.recordStatus = this.selectedRecord.previousStatus || 'NEW';
      this.selectedRecord.modifiedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedBy = this.currentUser;
      this.selectedRecord.modifiedCount = (this.selectedRecord.modifiedCount || 0) + 1;
      this.logHistory(this.selectedRecord, 'Revert', prev, this.selectedRecord.recordStatus);
      this.saveRecord(this.selectedRecord);
      this.applyFilters();
    }
  }

  voidRecordFromLocked() {
    if (this.selectedRecord && this.selectedRecord.recordStatus === 'ISSUED') {
      const prev = this.selectedRecord.recordStatus || 'UNKNOWN';
      this.selectedRecord.previousStatus = prev;
      this.selectedRecord.recordStatus = 'VOID';
      this.selectedRecord.modifiedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedBy = this.currentUser;
      this.selectedRecord.modifiedCount = (this.selectedRecord.modifiedCount || 0) + 1;
      this.logHistory(this.selectedRecord, 'Void', prev, 'VOID');
      this.saveRecord(this.selectedRecord);
      this.applyFilters();
    }
  }

  releaseVoidFromLocked() {
    if (this.selectedRecord && this.selectedRecord.recordStatus === 'VOID') {
      const prev = this.selectedRecord.recordStatus;
      this.selectedRecord.recordStatus = 'ISSUED';
      this.selectedRecord.modifiedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedBy = this.currentUser;
      this.selectedRecord.modifiedCount = (this.selectedRecord.modifiedCount || 0) + 1;
      this.logHistory(this.selectedRecord, 'Release Void', prev, 'ISSUED');
      this.saveRecord(this.selectedRecord);
      this.applyFilters();
    }
  }

  deleteRecord() {
    if (!this.selectedRecord) return;
    
    if (this.selectedRecord.recordStatus === 'NEW') {
      if (confirm('Are you sure you want to permanently delete this record?')) {
        const id = this.selectedRecord.id!;
        this.allRecords = this.allRecords.filter(r => r !== this.selectedRecord);
        this.selectedRecord = null;
        this.deleteRecordFromApi(id);
        this.applyFilters();
        this.showToast('Record permanently deleted.');
      }
    } else if (['ISSUED', 'VOID'].includes(this.selectedRecord.recordStatus || '')) {
      const prev = this.selectedRecord.recordStatus || 'UNKNOWN';
      this.selectedRecord.previousStatus = prev;
      this.selectedRecord.recordStatus = 'PENDING DELETION';
      this.selectedRecord.modifiedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedBy = this.currentUser;
      this.selectedRecord.modifiedCount = (this.selectedRecord.modifiedCount || 0) + 1;
      this.logHistory(this.selectedRecord, 'Delete', prev, 'PENDING DELETION');
      this.saveRecord(this.selectedRecord);
      this.applyFilters();
    }
  }

  approveDeleteRecord() {
    if (this.selectedRecord && this.selectedRecord.recordStatus === 'PENDING DELETION' && this.canApprove(this.selectedRecord)) {
      const id = this.selectedRecord.id!;
      this.allRecords = this.allRecords.filter(r => r !== this.selectedRecord);
      this.selectedRecord = null;
      this.deleteRecordFromApi(id);
      this.applyFilters();
      this.showToast('Record physical deletion approved and removed.');
    }
  }

  revertDeleteFromLocked() {
    if (this.selectedRecord && this.selectedRecord.recordStatus === 'PENDING DELETION') {
      const prev = this.selectedRecord.recordStatus;
      this.selectedRecord.recordStatus = this.selectedRecord.previousStatus || 'ISSUED';
      this.selectedRecord.modifiedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedBy = this.currentUser;
      this.selectedRecord.modifiedCount = (this.selectedRecord.modifiedCount || 0) + 1;
      this.logHistory(this.selectedRecord, 'Revert Delete', prev, this.selectedRecord.recordStatus);
      this.saveRecord(this.selectedRecord);
      this.applyFilters();
    }
  }

  canApprove(record: IssuanceRecord): boolean {
    const lastActor = record.modifiedBy || record.createdBy;
    if (!lastActor) return true;
    return lastActor !== this.currentUser;
  }

  approveRecordFromLocked() {
    if (this.selectedRecord && this.selectedRecord.recordStatus === 'PENDING' && this.canApprove(this.selectedRecord)) {
      const prev = this.selectedRecord.recordStatus || 'UNKNOWN';
      this.selectedRecord.recordStatus = 'ISSUED';
      this.selectedRecord.approvedBy = this.currentUser;
      this.selectedRecord.approvedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedBy = this.currentUser;
      this.selectedRecord.modifiedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedCount = (this.selectedRecord.modifiedCount || 0) + 1;
      this.logHistory(this.selectedRecord, 'Approve', prev, 'ISSUED');
      this.saveRecord(this.selectedRecord);
      this.applyFilters();
    }
  }

  openBulkModal(actionType: string) {
    this.selectedBulkRecords = this.allRecords.filter(r => r.selected);
    if (this.selectedBulkRecords.length > 0) {
      this.bulkActionType = actionType;
      this.bulkModalVisible = true;
    }
  }

  closeBulkModal() {
    this.bulkModalVisible = false;
    this.bulkActionType = null;
    this.selectedBulkRecords = [];
  }

  confirmBulkAction() {
    const now = new Date().toISOString();
    
    // First pass to handle physical deletes since they mutate the array
    if (this.bulkActionType === 'DELETE') {
      const recordsToKeep = this.allRecords.filter(r => !(r.selected && r.recordStatus === 'NEW'));
      const removedCount = this.allRecords.length - recordsToKeep.length;
      if (removedCount > 0) {
        this.allRecords = recordsToKeep;
      }
    } else if (this.bulkActionType === 'APPROVE_DELETE') {
      const recordsToKeep = this.allRecords.filter(r => !(r.selected && r.recordStatus === 'PENDING DELETION' && this.canApprove(r)));
      const removedCount = this.allRecords.length - recordsToKeep.length;
      if (removedCount > 0) {
        this.allRecords = recordsToKeep;
      }
    }

    this.allRecords.forEach(r => {
      if (r.selected) {
         const prev = r.recordStatus || 'UNKNOWN';
         let stateChanged = false;

         if (this.bulkActionType === 'SUBMIT' && r.recordStatus === 'NEW') {
           r.recordStatus = 'PENDING';
           stateChanged = true;
         } else if (this.bulkActionType === 'REVERT' && r.recordStatus === 'PENDING') {
           r.recordStatus = r.previousStatus || 'NEW';
           stateChanged = true;
         } else if (this.bulkActionType === 'VOID' && r.recordStatus === 'ISSUED') {
           r.previousStatus = prev;
           r.recordStatus = 'VOID';
           stateChanged = true;
         } else if (this.bulkActionType === 'RELEASE_VOID' && r.recordStatus === 'VOID') {
           r.previousStatus = prev;
           r.recordStatus = 'ISSUED';
           stateChanged = true;
         } else if (this.bulkActionType === 'DELETE' && ['ISSUED', 'VOID'].includes(r.recordStatus || '')) {
           r.previousStatus = prev;
           r.recordStatus = 'PENDING DELETION';
           stateChanged = true;
         } else if (this.bulkActionType === 'REVERT_DELETE' && r.recordStatus === 'PENDING DELETION') {
           r.recordStatus = r.previousStatus || 'ISSUED';
           stateChanged = true;
         } else if (this.bulkActionType === 'APPROVE' && r.recordStatus === 'PENDING' && this.canApprove(r)) {
           r.recordStatus = 'ISSUED';
           r.approvedBy = this.currentUser;
           r.approvedTimestamp = now;
           stateChanged = true;
         }

         if (stateChanged) {
           this.logHistory(r, `Bulk ${this.bulkActionType}`, prev, r.recordStatus || 'UNKNOWN');
           r.modifiedBy = this.currentUser;
           r.modifiedTimestamp = now;
           r.modifiedCount = (r.modifiedCount || 0) + 1;
         }
         r.selected = false;
      }
    });

    // Persist each modified record to the backend
    this.allRecords.forEach(r => {
      if (r.id) this.saveRecord(r);
    });

    this.applyFilters();
    let actionName = this.bulkActionType?.toLowerCase().replace('_', ' ') || 'operation';
    this.closeBulkModal();
    this.showToast(`Bulk ${actionName} completed successfully.`);
  }

  isHistoryCollapsed: boolean = false;
  historicalFiles: UploadHistory[] = [];

  toggleHistory() {
    this.isHistoryCollapsed = !this.isHistoryCollapsed;
  }

  getHistorySummary(history: UploadHistory): string {
    const records = this.getLiveRecordsForHistory(history);
    const counts: { [key: string]: number } = {};
    records.forEach(r => {
      const st = r.recordStatus || 'NEW';
      counts[st] = (counts[st] || 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => `${status}: ${count}`).join(' | ');
  }

  getLiveRecordsForHistory(history: UploadHistory): IssuanceRecord[] {
    // Return live references from allRecords if available
    if (!history.records || history.records.length === 0) return [];
    const historyIds = new Set(history.records.map(r => r.id).filter(id => id));
    
    if (historyIds.size > 0) {
      return this.allRecords.filter(r => r.id && historyIds.has(r.id));
    }
    // Fallback to snapshot records if they predate IDs
    return history.records;
  }

  getDynamicFileStatus(history: UploadHistory): string {
    const liveRecords = this.getLiveRecordsForHistory(history);
    if (!liveRecords || liveRecords.length === 0) return 'Completed';
    
    let hasEndState = true;
    let hasNew = false;
    let hasPending = false;
    
    liveRecords.forEach(r => {
      const st = r.recordStatus;
      if (st === 'NEW') hasNew = true;
      if (['PENDING', 'PENDING DELETION'].includes(st || '')) hasPending = true;
      if (!['ISSUED', 'VOID'].includes(st || '')) hasEndState = false;
    });

    if (hasEndState && liveRecords.length === history.records.length) return 'Completed'; // Only if none were physically deleted. Actually physically deleted items reach end too.
    if (hasEndState) return 'Completed';
    if (!hasNew && !hasPending) return 'Completed'; // In case all were physically deleted

    if (hasNew && !hasPending && !liveRecords.some(r => ['ISSUED', 'VOID', 'PENDING DELETION', 'PENDING'].includes(r.recordStatus || ''))) {
      return 'New';
    }
    
    return 'In Progress';
  }

  showFileDataModal = false;
  selectedFileData: UploadHistory | null = null;
  selectedFileDataRecords: IssuanceRecord[] = [];
  pendingDeleteHistory: UploadHistory | null = null;
  readonly filePreviewColumns: FilePreviewColumn[] = [
    { key: 'date', label: 'Issue Date' },
    { key: 'serialNumber', label: 'Serial Number' },
    { key: 'accountNumber', label: 'Account Number' },
    { key: 'beneficiaryName', label: 'Beneficiary' },
    { key: 'sourceType', label: 'Source' },
    { key: 'beneficiaryAddressLine1', label: 'Address' },
    { key: 'amount', label: 'Amount', align: 'right', format: 'number' },
    { key: 'recordStatus', label: 'Status' }
  ];

  loadHistoricalFile(history: UploadHistory) {
    this.activeHistoryId = history.id;
    this.applyFilters();
    this.selectedFileData = history;
    this.selectedFileDataRecords = this.getLiveRecordsForHistory(history);
    this.showFileDataModal = true;
  }

  closeFileDataModal() {
    this.showFileDataModal = false;
    this.selectedFileData = null;
    this.selectedFileDataRecords = [];
  }

  get filePreviewSubtitle(): string {
    return 'Review uploaded issuance data before moving into decisioning and approval.';
  }

  get filePreviewUploadedLabel(): string {
    return this.selectedFileData?.uploadDate || '';
  }

  get deleteHistoryConfirmMessage(): string {
    const fileName = this.pendingDeleteHistory?.fileName || 'this uploaded file';
    return `Are you sure you want to permanently delete "${fileName}" and its issuance records?`;
  }

  showAllRecords() {
    this.activeHistoryId = null;
    this.applyFilters();
    this.closeFileDataModal();
    this.showToast('Viewing all issuance records.');
  }

  canDeleteHistoricalFile(history: UploadHistory): boolean {
    return true;
  }

  requestDeleteHistoricalFile(history: UploadHistory) {
    this.pendingDeleteHistory = history;
  }

  cancelDeleteHistoricalFile() {
    this.pendingDeleteHistory = null;
  }

  confirmDeleteHistoricalFile() {
    const history = this.pendingDeleteHistory;
    if (!history) return;
    this.pendingDeleteHistory = null;

    const liveRecords = this.getLiveRecordsForHistory(history);
    const idsToRemove = new Set(liveRecords.map(r => r.id));

    if (idsToRemove.size > 0) {
      this.allRecords = this.allRecords.filter(r => !idsToRemove.has(r.id));
    }

    this.historicalFiles = this.historicalFiles.filter(h => h.id !== history.id);
    if (this.activeHistoryId === history.id) {
      this.activeHistoryId = null;
    }
    if (this.selectedFileData?.id === history.id) {
      this.closeFileDataModal();
    }

    this.deleteFileFromApi(history.id);
    this.applyFilters();
    this.showToast(`Deleted file "${history.fileName}" successfully.`);
  }

  submitForm() {
    if (!this.isFormValid()) {
      this.errorMessage = "Please fill out all mandatory Check Details fields:\n\n- Account Number\n- Serial Number\n- Issued Date\n- Amount\n- Currency";
      this.showErrorModal = true;
      return;
    }

    const now = new Date().toISOString();
      this.newRecord.modifiedBy = this.currentUser;
      
      if (this.selectedRecord) {
        const index = this.allRecords.indexOf(this.selectedRecord);
        if (index > -1) {
          const prev = this.selectedRecord.recordStatus || 'UNKNOWN';
          this.newRecord.modifiedTimestamp = now;
          this.newRecord.modifiedCount = (this.newRecord.modifiedCount || 0) + 1;
          this.newRecord.recordStatus = 'PENDING';
          
          if (!this.newRecord.historyList) this.newRecord.historyList = [];
          this.newRecord.historyList.push({
            timestamp: now,
            action: 'Save Modifications',
            previousState: prev,
            newState: 'PENDING',
            actor: this.currentUser
          });

          Object.assign(this.allRecords[index], this.newRecord);
          this.selectedRecord = this.allRecords[index];
          this.markDuplicates();
          this.saveRecord(this.allRecords[index], false);
          this.showFormModal = false;
        }
      } else {
        this.newRecord.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        this.newRecord.createdBy = this.currentUser;
        this.newRecord.createdTimestamp = now;
        if (!this.newRecord.historyList) this.newRecord.historyList = [];
        const created = { ...this.newRecord };
        this.allRecords.unshift(created);
        this.markDuplicates();
        this.saveRecord(created, true);
        this.showFormModal = false;
        this.showToast('Record saved. Duplicate status updated if applicable.');
      }
      this.applyFilters();
      this.isFormEditable = false;
  }

  // Account Search Methods
  openAccountSearch() {
    this.showAccountSearchModal = true;
    this.accountSearchQuery = this.newRecord.accountNumber || '';
    this.filterAccounts();
  }

  closeAccountSearchModal() {
    this.showAccountSearchModal = false;
  }

  filterAccounts() {
    if (!this.accountSearchQuery) {
      this.filteredAccounts = [...this.mockAccounts];
    } else {
      const q = this.accountSearchQuery.toLowerCase();
      this.filteredAccounts = this.mockAccounts.filter(a => 
        a.accountNumber.toLowerCase().includes(q) || 
        a.accountName.toLowerCase().includes(q)
      );
    }
  }

  selectAccount(acc: any) {
    this.newRecord.accountNumber = acc.accountNumber;
    this.closeAccountSearchModal();
  }

  closeErrorModal() {
    this.showErrorModal = false;
    this.errorMessage = '';
  }
}
