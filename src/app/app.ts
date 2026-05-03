import { Component, inject, signal, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ReactiveFormsModule, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  
  protected readonly title = signal('ccd-app');
  public loginError = signal('');
  public currentUser = signal<any>(null);
  public isSidebarOpen = signal(false);

  /** Returns true if the logged-in user has any of the given roles. */
  public hasRole(...roles: string[]): boolean {
    const user = this.currentUser();
    if (!user) return false;
    return roles.some(r => (user.userType || user.role || '').toLowerCase() === r.toLowerCase());
  }

  /** True for bank-operations roles (Check Processing, ICL). */
  public get isBankOps(): boolean {
    return this.hasRole('BankOps', 'Supervisor', 'Administrator');
  }
  /** True for corporate roles (Issuance, Stops). */
  public get isCorporate(): boolean {
    return this.hasRole('Corporate', 'Supervisor', 'Administrator');
  }
  /** True for admin-only pages. */
  public get isAdmin(): boolean {
    return this.hasRole('Administrator');
  }
  /** Supervisor or Admin — can approve corrections, see all tabs. */
  public get isSupervisor(): boolean {
    return this.hasRole('Supervisor', 'Administrator');
  }

  public toggleSidebar() {
    this.isSidebarOpen.update(v => !v);
  }

  public closeSidebar() {
    this.isSidebarOpen.set(false);
  }

  public loginForm = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required]
  });

  public onSubmit() {
    if (this.loginForm.invalid) {
      this.loginError.set('Please fill out all fields.');
      return;
    }

    const { username, password } = this.loginForm.value;

    // Authenticate against the backend users API
    this.http.get<any[]>('http://localhost:3000/api/administration/users').subscribe({
      next: (users) => {
        const user = users.find(u =>
          u.username === username &&
          u.password === password &&
          u.status === 'ACTIVE'
        );
        if (user) {
          this.currentUser.set(user);
          this.loginError.set('');
        } else {
          this.loginError.set('Invalid username or password.');
        }
      },
      error: () => {
        this.loginError.set('Failed to connect to the server.');
      }
    });
  }

  public logout() {
    this.currentUser.set(null);
    this.loginForm.reset();
  }
}
