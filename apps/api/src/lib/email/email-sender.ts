export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.log(
      `\n[dev email] to=${message.to} subject="${message.subject}"\n${message.text}\n`,
    );
  }
}

export const emailSender: EmailSender = new ConsoleEmailSender();
