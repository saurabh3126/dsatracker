const pathToService = '../../backend/src/services/emailService';

describe('emailService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it('falls back to SMTP when Web3Forms is configured but server-side is disabled', async () => {
    process.env = {
      ...originalEnv,
      WEB3FORMS_ACCESS_KEY: 'test_web3_key',
      WEB3FORMS_ALLOW_SERVER: 'false',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'user@example.com',
      SMTP_PASS: 'pass',
      SMTP_FROM: 'noreply@example.com',
      ADMIN_EMAIL: 'admin@example.com',
    };

    const sendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-1' });
    const createTransport = jest.fn(() => ({ sendMail }));

    jest.doMock('nodemailer', () => ({ createTransport }));

    const { sendEmail } = require(pathToService);

    const result = await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: 'Hello',
      htmlContent: '<p>Test</p>',
      replyTo: { email: 'reply@example.com', name: 'Reply' },
    });

    expect(result).toEqual(
      expect.objectContaining({
        provider: 'smtp',
        result: expect.any(Object),
      }),
    );
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        to: 'admin@example.com',
        subject: 'Hello',
      }),
    );
  });

  it('uses Web3Forms when server-side submissions are explicitly allowed', async () => {
    process.env = {
      ...originalEnv,
      WEB3FORMS_ACCESS_KEY: 'test_web3_key',
      WEB3FORMS_ALLOW_SERVER: 'true',
      ADMIN_EMAIL: '',
    };

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'OK' }),
    });

    global.fetch = fetchMock;

    const createTransport = jest.fn();
    jest.doMock('nodemailer', () => ({ createTransport }));

    const { sendEmail } = require(pathToService);

    const result = await sendEmail({
      subject: 'From web3',
      htmlContent: '<p>Body</p>',
      fromName: 'Tester',
      replyTo: { email: 'reply@example.com', name: 'Reply' },
    });

    expect(result).toEqual(
      expect.objectContaining({
        provider: 'web3forms',
        result: expect.any(Object),
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('skips when Web3Forms is disabled and SMTP is not configured', async () => {
    process.env = {
      ...originalEnv,
      WEB3FORMS_ACCESS_KEY: 'test_web3_key',
      WEB3FORMS_ALLOW_SERVER: 'false',
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASS: '',
    };

    jest.doMock('nodemailer', () => ({ createTransport: jest.fn() }));

    const { sendEmail } = require(pathToService);

    const result = await sendEmail({
      to: 'admin@example.com',
      subject: 'Hello',
      htmlContent: '<p>Test</p>',
    });

    expect(result).toEqual(
      expect.objectContaining({
        provider: 'web3forms',
        skipped: true,
        reason: 'server_side_not_allowed',
      }),
    );
  });
});
