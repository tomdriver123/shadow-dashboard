import { Component, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  appPages = [
    { title: 'Home', url: '/tabs/home', icon: 'home-outline' },
    { title: 'Habits', url: '/tabs/habits', icon: 'calendar-outline' },
    { title: 'Agents', url: '/tabs/agents', icon: 'people-outline' },
    { title: 'Feedback', url: '/tabs/feedback', icon: 'chatbox-ellipses-outline' },
    { title: 'Career', url: '/tabs/career', icon: 'briefcase-outline' },
    { title: 'Sabrina', url: '/sabrina', icon: 'person-circle-outline' },
  ];

  menuDisabled = false;

  private router = inject(Router);

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        this.menuDisabled = e.urlAfterRedirects.startsWith('/sabrina');
      });
  }
}
