export interface FileRecord {
  id: string;
  conversationId?: string;
  projectId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  localUri: string;
  extractedTextPreview?: string;
  /** "local" = never sent to a remote provider; "remote" = will be/was sent to whichever provider is active (brief section 38 — local privacy indication). */
  destination: "local" | "remote";
  createdAt: number;
}
