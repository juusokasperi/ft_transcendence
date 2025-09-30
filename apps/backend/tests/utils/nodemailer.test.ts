import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
    createTestAccount: vi.fn(),
    getTestMessageUrl: vi.fn(),
  },
}));

// Mock config
vi.mock('../../utils/config.ts', () => ({
  FRONTEND_URL: 'http://localhost:3000',
  MAIL_TRANSPORT_CONFIG: null,
  MAIL_FROM: 'test@example.com',
}));

// Import after mocks
import { sendEmailChangeEmail } from '../../utils/nodemailer/index.ts';
import nodemailer from 'nodemailer';

describe('sendEmailChangeEmail', () => {
  const mockTransporter = {
    sendMail: vi.fn(),
  };

  const mockCreateTransport = nodemailer.createTransport as Mock;
  const mockCreateTestAccount = nodemailer.createTestAccount as Mock;
  const mockGetTestMessageUrl = nodemailer.getTestMessageUrl as Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock test account creation
    mockCreateTestAccount.mockResolvedValue({
      smtp: {
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
      },
      user: 'test-user',
      pass: 'test-pass',
    });

    // Mock transporter creation
    mockCreateTransport.mockReturnValue(mockTransporter);

    // Mock test message URL
    mockGetTestMessageUrl.mockReturnValue('http://test-preview-url');
  });

  it('should send email change confirmation email successfully', async () => {
    const recipientEmail = 'user@example.com';
    const token = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    // Mock successful send
    mockTransporter.sendMail.mockResolvedValue({
      accepted: [recipientEmail],
      rejected: [],
    });

    const result = await sendEmailChangeEmail(recipientEmail, token);

    expect(result).toBe(true);
    expect(mockTransporter.sendMail).toHaveBeenCalledWith({
      from: 'test@example.com',
      to: recipientEmail,
      subject: 'Confirm your new email for BabylonPong',
      html: expect.stringContaining(
        'confirm-email/abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      ),
    });
  });

  it('should return false when email sending fails', async () => {
    const recipientEmail = 'user@example.com';
    const token = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    // Mock failed send
    mockTransporter.sendMail.mockRejectedValue(new Error('SMTP error'));

    const result = await sendEmailChangeEmail(recipientEmail, token);

    expect(result).toBe(false);
  });

  it('should return false when no recipients are accepted', async () => {
    const recipientEmail = 'user@example.com';
    const token = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    // Mock send with no accepted recipients
    mockTransporter.sendMail.mockResolvedValue({
      accepted: [],
      rejected: [recipientEmail],
    });

    const result = await sendEmailChangeEmail(recipientEmail, token);

    expect(result).toBe(false);
  });

  it('should include correct confirmation URL in email', async () => {
    const recipientEmail = 'user@example.com';
    const token = 'testtoken123';

    mockTransporter.sendMail.mockResolvedValue({
      accepted: [recipientEmail],
      rejected: [],
    });

    await sendEmailChangeEmail(recipientEmail, token);

    const callArgs = mockTransporter.sendMail.mock.calls[0][0];
    expect(callArgs.html).toContain('http://localhost:3000/confirm-email/testtoken123');
    expect(callArgs.html).toContain('BabylonPong');
  });
});
