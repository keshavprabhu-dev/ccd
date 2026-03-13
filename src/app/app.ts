import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ReactiveFormsModule],
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

    this.http.get<any[]>('users.json').subscribe({
      next: (users) => {
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
          this.currentUser.set(user);
          this.loginError.set('');
        } else {
          this.loginError.set('Invalid username or password.');
        }
      },
      error: () => {
        this.loginError.set('Failed to connect to the database.');
      }
    });
  }

  public logout() {
    this.currentUser.set(null);
    this.loginForm.reset();
  }
}
