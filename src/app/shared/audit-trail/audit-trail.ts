import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface AuditFields {
  createdBy?: string;
  createdTimestamp?: string;
  modifiedBy?: string;
  modifiedTimestamp?: string;
  approvedBy?: string;
  approvedTimestamp?: string;
  modifiedCount?: number;
}

@Component({
  selector: 'app-audit-trail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './audit-trail.html',
})
export class AuditTrailComponent {
  @Input() record: AuditFields = {};
}
