import { Component } from '@angular/core';

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
    { title: 'Brain', url: '/tabs/brain', icon: 'bulb-outline' },
    { title: 'Career', url: '/tabs/career', icon: 'briefcase-outline' },
  ];

  constructor() {}
}
