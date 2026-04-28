import { Component, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SumPipe, SumFieldPipe, CountImagesPipe } from './icl-pipes';
import { environment } from '../../../environments/environment.development';

@Component({
  selector: 'app-icl-parser',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe, SumPipe, SumFieldPipe, CountImagesPipe],
  templateUrl: './icl-parser.html',
  styleUrl: './icl-parser.css'
})
export class IclParser implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  // Upload state
  selectedFile: File | null = null;
  isUploading = false;
  message = '';
  isError = false;
  isDragOver = false;

  // Parsed result
  parsedData: any = null;
  fileHistory: any[] = [];

  // Filter state
  filterText = '';
  filterDate = '';
  filterMinAmount: number | null = null;
  filterMaxAmount: number | null = null;

  // Lightbox
  lightboxOpen = false;
  lightboxImages: { url: string; side: string }[] = [];
  lightboxIndex = 0;
  lightboxCheckNum = 0;

  get filteredChecks(): any[] {
    if (!this.parsedData?.checks) return [];
    return this.parsedData.checks.filter((c: any, idx: number) => {
      const q = this.filterText.toLowerCase();
      const matchText = !q ||
        (c.routingNumber || '').toLowerCase().includes(q) ||
        (c.accountNumber || '').toLowerCase().includes(q) ||
        (c.serialNumber || '').toLowerCase().includes(q) ||
        (c.payeeName || '').toLowerCase().includes(q);
      const matchDate = !this.filterDate || (c.checkDate || '').startsWith(this.filterDate);
      const matchMin = this.filterMinAmount === null || c.amount >= this.filterMinAmount;
      const matchMax = this.filterMaxAmount === null || c.amount <= this.filterMaxAmount;
      return matchText && matchDate && matchMin && matchMax;
    });
  }

  ngOnInit() {
    this.loadHistory();
  }

  loadHistory() {
    this.http.get(`${environment.apiUrl}/icl-parser/files`).subscribe({
      next: (data: any) => { this.fileHistory = data; this.cdr.detectChanges(); },
      error: (err) => console.error('Error loading history:', err)
    });
  }

  onFileSelected(event: any) {
    if (event.target.files?.[0]) this.handleFile(event.target.files[0]);
  }

  onDragOver(event: DragEvent) { event.preventDefault(); event.stopPropagation(); this.isDragOver = true; }
  onDragLeave(event: DragEvent) { event.preventDefault(); event.stopPropagation(); this.isDragOver = false; }

  onDrop(event: DragEvent) {
    event.preventDefault(); event.stopPropagation();
    this.isDragOver = false;
    if (event.dataTransfer?.files?.[0]) this.handleFile(event.dataTransfer.files[0]);
  }

  private handleFile(file: File) {
    this.selectedFile = file;
    this.message = '';
    this.isError = false;
  }

  clearFile() {
    this.selectedFile = null;
    this.message = '';
    this.isError = false;
    const fi = document.getElementById('icl-file') as HTMLInputElement;
    if (fi) fi.value = '';
  }

  uploadFile(override = false) {
    if (!this.selectedFile) return;
    this.isUploading = true;
    this.message = '';
    this.isError = false;
    this.parsedData = null;

    const reader = new FileReader();
    reader.onload = () => {
      let base64Content = reader.result as string;
      if (base64Content.includes(',')) base64Content = base64Content.split(',')[1];

      this.http.post(`${environment.apiUrl}/icl-parser/upload`, {
        fileName: this.selectedFile!.name,
        fileContent: base64Content,
        override: override
      }).subscribe({
        next: (response: any) => {
          this.isUploading = false;
          this.isError = false;
          this.message = `✓ Successfully parsed ${response.parsedData?.summary?.count ?? 0} checks from "${this.selectedFile!.name}"`;
          this.parsedData = response.parsedData;
          this.selectedFile = null;
          this.loadHistory();
          const fileInput = document.getElementById('icl-file') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isUploading = false;
          if (err.status === 409) {
             if (confirm("Warning: A file with this name has already been uploaded. Are you sure you want to load and parse it again?")) {
                 this.uploadFile(true);
             } else {
                 this.isError = true;
                 this.message = 'Upload cancelled (Duplicate file).';
                 this.cdr.detectChanges();
             }
          } else {
            this.isError = true;
            this.message = 'An error occurred during upload.';
            this.cdr.detectChanges();
          }
        }
      });
    };
    reader.onerror = () => {
      this.isUploading = false;
      this.isError = true;
      this.message = 'Could not read file.';
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(this.selectedFile);
  }

  // ── Lightbox ─────────────────────────────────────────────────────────────
  selectedCheck: any = null;

  viewHistoricalFile(record: any) {
    this.isUploading = true;
    this.message = '';
    this.isError = false;
    this.parsedData = null;
    this.clearFile();

    this.http.get(`${environment.apiUrl}/icl-parser/files/${encodeURIComponent(record.fileName)}`).subscribe({
      next: (response: any) => {
        this.isUploading = false;
        this.isError = false;
        this.message = `✓ Successfully loaded historical file: "${record.fileName}"`;
        this.parsedData = response.parsedData;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isUploading = false;
        this.isError = true;
        this.message = err.status === 404 ? 'Original file no longer exists on server.' : 'Could not parse historical file.';
        this.cdr.detectChanges();
      }
    });
  }

  deleteHistoricalFile(record: any) {
    if (!confirm(`Are you sure you want to permanently delete "${record.fileName}" and its extracted images?`)) return;
    this.http.delete(`${environment.apiUrl}/icl-parser/files/${record.id}`).subscribe({
      next: () => {
        this.message = `✓ Successfully deleted "${record.fileName}"`;
        this.isError = false;
        if (this.parsedData?.fileName === record.fileName || (this.selectedFile && this.selectedFile.name === record.fileName)) {
            // clear active parsed screen if we are viewing it
            this.parsedData = null;
        }
        this.loadHistory();
      },
      error: (err) => {
        console.error('Delete error:', err);
        this.message = `Failed to delete "${record.fileName}"`;
        this.isError = true;
        this.cdr.detectChanges();
      }
    });
  }

  openLightbox(check: any, checkNum: number) {
    this.selectedCheck = check;
    this.lightboxImages = check.images || [];
    this.lightboxIndex = 0;
    this.lightboxCheckNum = checkNum;
    this.lightboxOpen = true;
    document.body.style.overflow = 'hidden';
  }

  closeLightbox() {
    this.lightboxOpen = false;
    document.body.style.overflow = '';
  }

  prevImage() {
    if (this.lightboxIndex > 0) this.lightboxIndex--;
  }

  nextImage() {
    if (this.lightboxIndex < this.lightboxImages.length - 1) this.lightboxIndex++;
  }

  clearFilters() {
    this.filterText = '';
    this.filterDate = '';
    this.filterMinAmount = null;
    this.filterMaxAmount = null;
  }
}
