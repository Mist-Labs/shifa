export interface CHWProfile {
  id: string;
  name?: string;
  country?: string;
  language?: string;
  alertRecipients?: string[];
  guardEnabled?: boolean;
  createdAt?: string;
}

export default CHWProfile;
