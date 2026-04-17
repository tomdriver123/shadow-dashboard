import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Agent } from '../../services/agent.model';
import { AgentProfilePanelComponent } from '../agent-profile-panel/agent-profile-panel.component';

@Component({
  selector: 'app-agent-profile-sheet',
  templateUrl: './agent-profile-sheet.component.html',
  styleUrls: ['./agent-profile-sheet.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, AgentProfilePanelComponent],
})
export class AgentProfileSheetComponent {
  @Input() agent!: Agent;
  @Input() showChatButton = true;

  constructor(
    private modalCtrl: ModalController,
    private router: Router,
  ) {}

  openChat(): void {
    this.modalCtrl.dismiss();
    this.router.navigate(['/chat', this.agent.id]);
  }

  triggerHeartbeat(): void {
    // TODO: wire to server command
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
