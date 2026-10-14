import { Component, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { PortalService } from './services/portal.service';

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
    { title: 'Poke Finder', url: '/tabs/poke', icon: 'map-outline' },
    { title: 'Sabrina', url: '/sabrina', icon: 'person-circle-outline' },
  ];

  menuDisabled = false;

  private router = inject(Router);
  private portal = inject(PortalService);

  /** Entering Sabrina's portal from the side menu marks the tab like the Home button does. */
  onMenuNav(url: string): void {
    if (url.startsWith('/sabrina')) this.portal.markEnteredFromTom();
  }

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        this.menuDisabled = e.urlAfterRedirects.startsWith('/sabrina');
      });
  }
}
