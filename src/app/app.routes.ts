import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard) },
  { path: 'issuance-management', loadComponent: () => import('./pages/issuance-management/issuance-management').then(m => m.IssuanceManagement) },
  { path: 'check-processing', loadComponent: () => import('./pages/check-processing/check-processing').then(m => m.CheckProcessing) },
  { path: 'stop-payments', loadComponent: () => import('./pages/stop-payments/stop-payments').then(m => m.StopPayments) },
  { path: 'administration', loadComponent: () => import('./pages/administration/administration').then(m => m.Administration) },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
];
