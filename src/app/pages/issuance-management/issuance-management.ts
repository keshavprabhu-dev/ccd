import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface IssuanceRecord {
  date: string;
  serialNumber: string;
  accountNumber: string;
  beneficiary: string;
  amount: number;
  createdBy?: string;
  createdTimestamp?: string;
  modifiedBy?: string;
  modifiedTimestamp?: string;
  approvedBy?: string;
  approvedTimestamp?: string;
  modifiedCount?: number;
  recordStatus?: string;
  previousStatus?: string;
  selected?: boolean;
}

@Component({
  selector: 'app-issuance-management',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  templateUrl: './issuance-management.html',
  styleUrl: './issuance-management.css',
})
export class IssuanceManagement {
  allRecords: IssuanceRecord[] = [];
  
  currentUser: string = 'UserA (Maker)';
  users: string[] = ['UserA (Maker)', 'UserB (Checker)'];


  filteredRecords: IssuanceRecord[] = [];
  
  // Pagination
  currentPage: number = 1;
  pageSize: number = 10;
  
  // Filters
  filters = {
    date: '',
    serialNumber: '',
    accountNumber: '',
    beneficiary: '',
    amount: ''
  };

  showFilters: boolean = false;

  toggleFilters() {
    this.showFilters = !this.showFilters;
    if (!this.showFilters) {
      this.filters = { date: '', serialNumber: '', accountNumber: '', beneficiary: '', amount: '' };
      this.applyFilters();
    }
  }

  showColumnConfig: boolean = false;
  columns = {
    date: true,
    serialNumber: true,
    accountNumber: true,
    beneficiary: true,
    amount: true,
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
      beneficiary: '',
      amount: 0,
      createdBy: this.currentUser,
      createdTimestamp: new Date().toISOString(),
      modifiedCount: 0,
      recordStatus: 'NEW'
    };
  }

  selectedRecord: IssuanceRecord | null = null;
  isFormEditable: boolean = true;

  selectedFile: File | null = null;
  selectedFileName: string = '';
  isUploading: boolean = false;

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.selectedFileName = file.name;
    }
  }

  uploadFile() {
    if (this.selectedFile) {
      this.isUploading = true;
      const fileReader = new FileReader();
      
      fileReader.onload = (e) => {
        const text = fileReader.result as string;
        
        setTimeout(() => {
          try {
            this.parseCSV(text);
          } catch (error) {
            console.error('Error during CSV parsing:', error);
          } finally {
            this.selectedFile = null;
            this.selectedFileName = '';
            const fileInput = document.getElementById('fileUpload') as HTMLInputElement;
            if (fileInput) {
              fileInput.value = '';
            }
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

  parseCSV(text: string) {
    const lines = text.split('\n');
    if (lines.length > 0) {
      const newRecords: IssuanceRecord[] = [];
      // Start from 1 assuming there's a header: IssuedDate,IssuedSerialNumber,Beneficiary,Amount
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          const parts = line.split(',');
          if (parts.length >= 4) {
            newRecords.push({
              date: parts[0]?.trim() || '',
              serialNumber: parts[1]?.trim() || '',
              beneficiary: parts[2]?.trim() || '',
              amount: parseFloat(parts[3]) || 0,
              accountNumber: parts[4]?.trim() || 'AC-0000',
              createdBy: this.currentUser,
              createdTimestamp: new Date().toISOString(),
              modifiedCount: 0,
              recordStatus: 'IMPORTED'
            });
          }
        }
      }
      if (newRecords.length > 0) {
        this.allRecords = [...newRecords, ...this.allRecords];
        this.applyFilters();
      }
    }
  }

  constructor(private cdr: ChangeDetectorRef) {
    this.applyFilters();
  }

  get paginatedRecords(): IssuanceRecord[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.filteredRecords.slice(startIndex, startIndex + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredRecords.length / this.pageSize) || 1;
  }

  applyFilters() {
    this.filteredRecords = this.allRecords.filter(record => {
      const matchDate = record.date.includes(this.filters.date);
      const matchSerial = record.serialNumber.toLowerCase().includes(this.filters.serialNumber.toLowerCase());
      const matchAccount = record.accountNumber.toLowerCase().includes(this.filters.accountNumber.toLowerCase());
      const matchBeneficiary = record.beneficiary.toLowerCase().includes(this.filters.beneficiary.toLowerCase());
      const matchAmount = this.filters.amount ? record.amount.toString().includes(this.filters.amount) : true;
      
      return matchDate && matchSerial && matchAccount && matchBeneficiary && matchAmount;
    });
    // Reset to first page whenever filters change
    this.currentPage = 1;
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  isFormValid(): boolean {
    return (
      this.newRecord.date.trim() !== '' &&
      this.newRecord.serialNumber.trim() !== '' &&
      this.newRecord.accountNumber.trim() !== '' &&
      this.newRecord.beneficiary.trim() !== '' &&
      this.newRecord.amount > 0
    );
  }

  selectRecord(record: IssuanceRecord) {
    this.selectedRecord = record;
    this.newRecord = { ...record };
    this.isFormEditable = false;
  }

  startNewRecord() {
    this.selectedRecord = null;
    this.newRecord = this.getEmptyRecord();
    this.isFormEditable = true;
  }

  unlockForm() {
    this.isFormEditable = true;
  }

  cancelForm() {
    if (this.selectedRecord) {
      this.newRecord = { ...this.selectedRecord };
      this.isFormEditable = false;
    } else {
      this.startNewRecord();
    }
  }

  exportRecords() {
    if (this.filteredRecords.length === 0) return;
    
    const headers = [
      'Issued Date', 'Serial Number', 'Account Number', 'Beneficiary', 'Amount',
      'Created By', 'Created Timestamp', 'Modified By', 'Modified Timestamp',
      'Approved By', 'Approved Timestamp', 'Modified Count', 'Status'
    ];

    const csvLines = this.filteredRecords.map(r => {
      return [
        r.date, r.serialNumber, r.accountNumber, r.beneficiary, r.amount,
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

  toggleAllSelection(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.paginatedRecords.forEach(r => r.selected = checked);
  }

  toastMessage: string | null = null;
  
  showToast(message: string) {
    this.toastMessage = message;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.toastMessage = null;
      this.cdr.detectChanges();
    }, 3000);
  }

  bulkModalVisible: boolean = false;
  bulkActionType: 'SUBMIT' | 'VOID' | 'DELETE' | 'APPROVE' | null = null;
  selectedBulkRecords: IssuanceRecord[] = [];

  submitRecordForApprovalFromLocked() {
    if (this.selectedRecord) {
      this.selectedRecord.recordStatus = 'PENDING';
      this.selectedRecord.modifiedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedBy = this.currentUser;
      this.selectedRecord.modifiedCount = (this.selectedRecord.modifiedCount || 0) + 1;
      this.applyFilters();
    }
  }

  voidRecordFromLocked() {
    if (this.selectedRecord) {
      this.selectedRecord.previousStatus = this.selectedRecord.recordStatus;
      this.selectedRecord.recordStatus = 'VOID';
      this.selectedRecord.modifiedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedBy = this.currentUser;
      this.selectedRecord.modifiedCount = (this.selectedRecord.modifiedCount || 0) + 1;
      this.applyFilters();
    }
  }

  revertVoidFromLocked() {
    if (this.selectedRecord && this.selectedRecord.recordStatus === 'VOID') {
      this.selectedRecord.recordStatus = this.selectedRecord.previousStatus || 'NEW';
      this.selectedRecord.modifiedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedBy = this.currentUser;
      this.selectedRecord.modifiedCount = (this.selectedRecord.modifiedCount || 0) + 1;
      this.applyFilters();
    }
  }

  deleteRecord() {
    if (this.selectedRecord) {
      this.selectedRecord.recordStatus = 'DELETED';
      this.selectedRecord.modifiedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedBy = this.currentUser;
      this.selectedRecord.modifiedCount = (this.selectedRecord.modifiedCount || 0) + 1;
      this.applyFilters();
    }
  }

  canApprove(record: IssuanceRecord): boolean {
    const lastActor = record.modifiedBy || record.createdBy;
    return lastActor !== this.currentUser;
  }

  approveRecordFromLocked() {
    if (this.selectedRecord && this.canApprove(this.selectedRecord)) {
      this.selectedRecord.recordStatus = 'APPROVED';
      this.selectedRecord.approvedBy = this.currentUser;
      this.selectedRecord.approvedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedBy = this.currentUser;
      this.selectedRecord.modifiedTimestamp = new Date().toISOString();
      this.selectedRecord.modifiedCount = (this.selectedRecord.modifiedCount || 0) + 1;
      this.applyFilters();
    }
  }

  openBulkModal(actionType: 'SUBMIT' | 'VOID' | 'DELETE' | 'APPROVE') {
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
    
    this.allRecords.forEach(r => {
      if (r.selected) {
         if (this.bulkActionType === 'SUBMIT') {
           if (r.recordStatus === 'NEW' || r.recordStatus === 'IMPORTED') {
             r.recordStatus = 'PENDING';
           }
         } else if (this.bulkActionType === 'VOID') {
           r.previousStatus = r.recordStatus;
           r.recordStatus = 'VOID';
         } else if (this.bulkActionType === 'DELETE') {
           r.recordStatus = 'DELETED';
         } else if (this.bulkActionType === 'APPROVE') {
           if (this.canApprove(r) && r.recordStatus === 'PENDING') {
             r.recordStatus = 'APPROVED';
             r.approvedBy = this.currentUser;
             r.approvedTimestamp = now;
           }
         }
         r.modifiedBy = this.currentUser;
         r.modifiedTimestamp = now;
         r.modifiedCount = (r.modifiedCount || 0) + 1;
         r.selected = false;
      }
    });

    this.applyFilters();
    
    let actionName = this.bulkActionType?.toLowerCase() || 'operation';
    if (this.bulkActionType === 'SUBMIT') actionName = 'submit';
    this.closeBulkModal();
    this.showToast(`Bulk ${actionName} operation completed successfully.`);
  }

  submitForm() {
    if (this.isFormValid()) {
      const now = new Date().toISOString();
      this.newRecord.modifiedBy = this.currentUser;
      
      if (this.selectedRecord) {
        const index = this.allRecords.indexOf(this.selectedRecord);
        if (index > -1) {
          this.newRecord.modifiedTimestamp = now;
          this.newRecord.modifiedCount = (this.newRecord.modifiedCount || 0) + 1;
          this.allRecords[index] = { ...this.newRecord };
          this.selectedRecord = this.allRecords[index]; 
        }
      } else {
        this.newRecord.createdBy = this.currentUser;
        this.newRecord.createdTimestamp = now;
        this.allRecords.unshift({ ...this.newRecord });
      }
      this.applyFilters();
      this.isFormEditable = false;
    }
  }
}
