export interface EmailMessage {
  to: string
  subject: string
  html: string
  text?: string
  templateName: string
  metadata?: Record<string, any>
}

export interface EmailSendResult {
  id: string
  provider: string
}

export interface EmailProvider {
  name: string
  send(msg: EmailMessage): Promise<EmailSendResult>
}