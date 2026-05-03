import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';

export interface Currency {
  code: string;
  name: string;
  isEnabled: number;
}

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private http = inject(HttpClient);

  /** Shared, cached observable — HTTP call fires only once across all consumers. */
  readonly currencies$: Observable<Currency[]> = this.http
    .get<Currency[]>('http://localhost:3000/api/currencies')
    .pipe(shareReplay(1));
}
