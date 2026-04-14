export interface Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  heartbeat: string;
  workspace: string;
  status: 'active' | 'paused' | 'planned' | 'inactive' | 'unknown' | 'archived';
  imageUrl?: string;
  color: string;
  animal?: string;
  description?: string;
}
