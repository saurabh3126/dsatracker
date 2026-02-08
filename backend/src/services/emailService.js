const nodemailer = require('nodemailer');
const dns = require('dns');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim();

const SMTP_HOST = (process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
const SMTP_USER = (process.env.SMTP_USER || '').trim();
// App passwords are often copied with spaces; remove all whitespace.
const SMTP_PASS = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
const SMTP_FROM = (process.env.SMTP_FROM || '').trim() || SMTP_USER || 'noreply@dsatracker.local';

let cachedTransporter;
let cachedTransporterIpv4;

function createTransporter({ family } = {}) {
  const transport = {
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
  };

  // Force IPv4/IPv6 when needed.
  // Useful when DNS returns an IPv6 address but the machine/network has no IPv6 route.
  const fam = Number(family);
  if (fam === 4 || fam === 6) {
    transport.family = fam;

    // Force DNS resolution to the requested family. This avoids cases where
    // the runtime prefers IPv6 but the network has no IPv6 route (common on some hosts).
    transport.lookup = (hostname, options, callback) => {
      const opts = typeof options === 'object' && options ? options : {};
      return dns.lookup(hostname, { ...opts, family: fam, all: false }, callback);
    };
  }

  return nodemailer.createTransport(transport);
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  cachedTransporter = createTransporter();

  return cachedTransporter;
}

function getTransporterIpv4() {
  if (cachedTransporterIpv4) return cachedTransporterIpv4;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  cachedTransporterIpv4 = createTransporter({ family: 4 });
  return cachedTransporterIpv4;
}

function shouldRetryWithIpv4(err) {
  const code = String(err?.code || '').toUpperCase();
  const syscall = String(err?.syscall || '').toLowerCase();
  const errno = Number(err?.errno);
  const address = String(err?.address || '');
  const msg = String(err?.message || '');
  const msgUpper = msg.toUpperCase();

  // If DNS picked an IPv6 address but the runtime has no IPv6 route,
  // Node frequently surfaces this as code=ESOCKET but message includes ENETUNREACH.
  if (msgUpper.includes('ENETUNREACH')) return true;

  // Typical direct code.
  if (code === 'ENETUNREACH') return true;

  // -101 is commonly "Network is unreachable" on Linux.
  if (errno === -101) return true;

  // Only retry connect-level failures (avoid masking auth/SMTP protocol errors).
  const isConnectFailure = syscall === 'connect' || String(err?.command || '').toUpperCase() === 'CONN';
  if (!isConnectFailure) return false;

  // Transient network/DNS errors where IPv4-only retry can help.
  if (code === 'EAI_AGAIN' || code === 'ETIMEDOUT') return true;

  // If we were given an IPv6 address (contains ':'), IPv4 retry is often useful.
  if (address.includes(':')) return true;

  // Nodemailer uses ESOCKET for low-level socket/connect failures.
  if (code === 'ESOCKET') return true;

  return false;
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

  const payload = {
    from: SMTP_FROM,
    to,
    subject,
    html: htmlContent,
  };

  try {
    return await transporter.sendMail(payload);
  } catch (error) {
    // If IPv6 is unreachable, retry once forcing IPv4.
    const retryEnabled = String(process.env.SMTP_RETRY_IPV4 || 'true').toLowerCase() !== 'false';
    if (retryEnabled && shouldRetryWithIpv4(error)) {
      try {
        const transporterV4 = getTransporterIpv4();
        if (transporterV4) {
          const info = await transporterV4.sendMail(payload);

          // If IPv4 works, prefer it for subsequent sends in this process.
          cachedTransporter = transporterV4;
          return info;
        }
      } catch (retryErr) {
        console.error('SMTP Email Error (IPv4 retry failed):', retryErr);
        throw retryErr;
      }
    }

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
