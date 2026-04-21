import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { MarkdownModule } from 'ngx-markdown';
import { VoiceRoutingModule } from './voice-routing.module';
import { VoicePage } from './voice.page';
import { AgentProfilePanelComponent } from '../../components/agent-profile-panel/agent-profile-panel.component';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, VoiceRoutingModule, AgentProfilePanelComponent, MarkdownModule],
  declarations: [VoicePage],
})
export class VoicePageModule {}
