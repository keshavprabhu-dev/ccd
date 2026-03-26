import { Component, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SumPipe, SumFieldPipe, CountImagesPipe } from './icl-pipes';

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
    this.http.get('http://localhost:3000/api/icl-parser/files').subscribe({
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

  uploadFile() {
    if (!this.selectedFile) return;
    this.isUploading = true;
    this.message = '';
    this.isError = false;
    this.parsedData = null;

    const reader = new FileReader();
    reader.onload = () => {
      let base64Content = reader.result as string;
      if (base64Content.includes(',')) base64Content = base64Content.split(',')[1];

      this.http.post('http://localhost:3000/api/icl-parser/upload', {
        fileName: this.selectedFile!.name,
        fileContent: base64Content
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
          this.isError = true;
          this.message = err.status === 409 ? 'This file has already been processed.' : 'An error occurred during upload.';
          this.cdr.detectChanges();
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
  openLightbox(check: any, checkNum: number) {
    if (!check.images?.length) return;
    this.lightboxImages = check.images;
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
