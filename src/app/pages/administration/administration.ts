import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { App } from '../../app';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/administration`;

interface User {
  id?: string;
  username: string;
  password?: string;
  role: string;
  status: string;
  // standard audit fields
  createdBy?: string;
  createdTimestamp?: string;
  modifiedBy?: string;
  modifiedTimestamp?: string;
  modifiedCount?: number;
  approvedBy?: string;
  approvedTimestamp?: string;
  authStatus?: string;
}

@Component({
  selector: 'app-administration',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './administration.html',
  styleUrl: './administration.css',
})
export class Administration implements OnInit {
  private http = inject(HttpClient);
  private app = inject(App);
  private cdr = inject(ChangeDetectorRef);

  users: User[] = [];
  filteredUsers: User[] = [];
  selectedUser: User | null = null;
  newUser: User = this.getEmptyUser();
  
  isFormEditable: boolean = false;
  isSaving: boolean = false;
  toastMessage: string | null = null;

  get currentUser(): string {
    const user = this.app.currentUser();
    return user ? user.username : 'System';
  }

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.http.get<User[]>(`${API}/users`).subscribe({
      next: (users) => {
        this.users = users;
        this.filteredUsers = users;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load users:', err);
        this.showToast('⚠️ Failed to load users from backend.');
      }
    });
  }

  getEmptyUser(): User {
    return {
      username: '',
      password: '',
      role: 'checker',
      status: 'ACTIVE',
      modifiedCount: 0
    };
  }

  selectUser(user: User) {
    this.selectedUser = user;
    this.newUser = { ...user };
    this.isFormEditable = false;
  }

  startNew() {
    this.selectedUser = null;
    this.newUser = this.getEmptyUser();
    this.isFormEditable = true;
  }

  unlockForm() {
    this.isFormEditable = true;
  }

  cancelEdit() {
    if (this.selectedUser) {
      this.newUser = { ...this.selectedUser };
      this.isFormEditable = false;
    } else {
      this.startNew();
      this.isFormEditable = false;
    }
  }

  isFormValid(): boolean {
    return this.newUser.username.trim() !== '' && 
           (this.selectedUser ? true : (this.newUser.password?.trim() !== ''));
  }

  submitForm() {
    if (!this.isFormValid()) return;

    this.isSaving = true;
    const now = new Date().toISOString();
    const userToSave = { ...this.newUser };

    if (!userToSave.id) {
      userToSave.id = 'U' + Date.now();
      userToSave.createdBy = this.currentUser;
      userToSave.createdTimestamp = now;
      userToSave.authStatus = 'U';
    } else {
      userToSave.modifiedBy = this.currentUser;
      userToSave.modifiedTimestamp = now;
      userToSave.modifiedCount = (userToSave.modifiedCount || 0) + 1;
    }

    this.http.put(`${API}/users/${userToSave.id}`, userToSave).subscribe({
      next: () => {
        this.showToast(`User ${userToSave.username} saved successfully.`);
        this.loadUsers();
        this.selectedUser = userToSave;
        this.isFormEditable = false;
        this.isSaving = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to save user:', err);
        this.showToast('⚠️ Failed to save user.');
        this.isSaving = false;
        this.cdr.detectChanges();
      }
    });
  }

  showToast(msg: string) {
    this.toastMessage = msg;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.toastMessage = null;
      this.cdr.detectChanges();
    }, 3000);
  }

  getStatusClass(status?: string): string {
    return 'status-' + (status || 'active').toLowerCase();
  }
}
