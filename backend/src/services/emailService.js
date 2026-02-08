const nodemailer = require('nodemailer');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim();

const SMTP_HOST = (process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
const SMTP_USER = (process.env.SMTP_USER || '').trim();
// App passwords are often copied with spaces; remove all whitespace.
const SMTP_PASS = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
const SMTP_FROM = (process.env.SMTP_FROM || '').trim() || SMTP_USER || 'noreply@dsatracker.local';

let cachedTransporter;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    // Fail fast when SMTP is blocked/unreachable (common on some hosts).
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000),
  });

  return cachedTransporter;
}

/**
 * Sends an email using SMTP (Nodemailer)
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.htmlContent - Email body in HTML
 */
const sendEmail = async ({ to, subject, htmlContent }) => {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      'SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS). Skipping email sending.',
      {
        hasHost: Boolean(SMTP_HOST),
        hasUser: Boolean(SMTP_USER),
        hasPass: Boolean(SMTP_PASS),
      }
    );
    return;
  }

  try {
    return await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html: htmlContent,
    });
  } catch (error) {
    console.error('SMTP Email Error:', error);
    throw error;
  }
};

/**
 * Sends feedback notification to admin
 * @param {Object} feedback - { type, message, userId }
 */
const sendFeedbackNotification = async (feedback) => {
  if (!ADMIN_EMAIL) {
    console.warn('ADMIN_EMAIL is not set. Skipping feedback email notification.');
    return;
  }

  const subject = `New ${feedback.type.toUpperCase()} from DSA Tracker`;
  const htmlContent = `
    <h3>New Feedback Received</h3>
    <p><strong>Type:</strong> ${feedback.type}</p>
    <p><strong>Message:</strong></p>
    <div style="padding: 15px; background: #f4f4f4; border-radius: 5px;">
      ${feedback.message.replace(/\n/g, '<br>')}
    </div>
    <p><strong>User ID:</strong> ${feedback.userId || 'Guest'}</p>
  `;

  return sendEmail({
    to: ADMIN_EMAIL,
    subject,
    htmlContent
  });
};

module.exports = {
  sendEmail,
  sendFeedbackNotification
};
