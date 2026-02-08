const nodemailer = require('nodemailer');

const WEB3FORMS_ACCESS_KEY = String(process.env.WEB3FORMS_ACCESS_KEY || '').trim();
const WEB3FORMS_TIMEOUT_MS = Number(process.env.WEB3FORMS_TIMEOUT_MS || 15000);
const WEB3FORMS_DEFAULT_FROM_NAME = String(process.env.WEB3FORMS_FROM_NAME || 'DSA Tracker').trim();

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

function isWeb3FormsConfigured() {
  return Boolean(WEB3FORMS_ACCESS_KEY);
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>(\r?\n)?/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeReplyTo(replyTo) {
  if (!replyTo) return null;
  if (typeof replyTo === 'string') {
    const email = replyTo.trim();
    return email ? { email } : null;
  }
  const email = String(replyTo?.email || '').trim();
  const name = String(replyTo?.name || '').trim();
  if (!email) return null;
  return name ? { email, name } : { email };
}

async function sendEmailViaWeb3Forms({ subject, htmlContent, fromName, replyTo }) {
  if (!isWeb3FormsConfigured()) return null;
  if (typeof fetch !== 'function') {
    throw new Error('Web3Forms requires global fetch (Node 18+).');
  }

  const normalizedReplyTo = normalizeReplyTo(replyTo);

  const payload = {
    access_key: WEB3FORMS_ACCESS_KEY,
    subject: String(subject || '').trim() || 'New submission',
    from_name: String(fromName || WEB3FORMS_DEFAULT_FROM_NAME || 'Notifications').trim(),
    // Web3Forms uses `email` as the reply-to by default.
    email: normalizedReplyTo?.email || '',
    name: normalizedReplyTo?.name || String(fromName || '').trim() || 'User',
    message: stripHtmlToText(htmlContent),
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(2000, WEB3FORMS_TIMEOUT_MS));

  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = String(json?.message || res.statusText || 'Web3Forms request failed').trim();
      const err = new Error(msg);
      err.status = res.status;
      err.provider = 'web3forms';
      throw err;
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

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
  if (!code) return false;

  // Typical when smtp.gmail.com resolves to an IPv6 address but IPv6 is unavailable.
  if (code === 'ENETUNREACH') return true;

  // Other transient network/DNS errors where IPv4-only retry can help.
  if (code === 'EAI_AGAIN' || code === 'ETIMEDOUT') return true;

  return false;
}

/**
 * Sends an email using Web3Forms (preferred when configured) or SMTP fallback.
 * @param {Object} options
 * @param {string} options.to - Recipient email (SMTP only; Web3Forms delivers to inbox tied to access key)
 * @param {string} options.subject - Email subject
 * @param {string} options.htmlContent - Email body in HTML
 * @param {string|{email:string,name?:string}} [options.replyTo] - Reply-To address
 * @param {string} [options.fromName] - Display sender name (Web3Forms from_name)
 */
const sendEmail = async ({ to, subject, htmlContent, replyTo, fromName }) => {
  if (isWeb3FormsConfigured()) {
    return sendEmailViaWeb3Forms({ subject, htmlContent, replyTo, fromName });
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      'SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS). Skipping email sending.',
      {
        hasWeb3FormsKey: Boolean(WEB3FORMS_ACCESS_KEY),
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

  const normalizedReplyTo = normalizeReplyTo(replyTo);
  if (normalizedReplyTo?.email) {
    payload.replyTo = normalizedReplyTo.name
      ? `${normalizedReplyTo.name} <${normalizedReplyTo.email}>`
      : normalizedReplyTo.email;
  }

  try {
    return await transporter.sendMail(payload);
  } catch (error) {
    // If IPv6 is unreachable, retry once forcing IPv4.
    const retryEnabled = String(process.env.SMTP_RETRY_IPV4 || 'true').toLowerCase() !== 'false';
    if (retryEnabled && shouldRetryWithIpv4(error)) {
      try {
        const transporterV4 = getTransporterIpv4();
        if (transporterV4) {
          return await transporterV4.sendMail(payload);
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
 * @param {Object} feedback - { type, message, userId, userName, userEmail }
 */
const sendFeedbackNotification = async (feedback) => {
  if (!ADMIN_EMAIL) {
    console.warn('ADMIN_EMAIL is not set. Skipping feedback email notification.');
    return;
  }

  const userName = String(feedback?.userName || '').trim();
  const userEmail = String(feedback?.userEmail || '').trim();
  const replyTo = userEmail ? { email: userEmail, name: userName } : null;

  const subject = `New ${feedback.type.toUpperCase()} from DSA Tracker`;
  const htmlContent = `
    <h3>New Feedback Received</h3>
    <p><strong>Type:</strong> ${feedback.type}</p>
    <p><strong>From:</strong> ${userName || 'User'}${userEmail ? ` &lt;${userEmail}&gt;` : ''}</p>
    <p><strong>Message:</strong></p>
    <div style="padding: 15px; background: #f4f4f4; border-radius: 5px;">
      ${feedback.message.replace(/\n/g, '<br>')}
    </div>
    <p><strong>User ID:</strong> ${feedback.userId || 'Guest'}</p>
  `;

  return sendEmail({
    to: ADMIN_EMAIL,
    subject,
    htmlContent,
    replyTo,
    fromName: userName || WEB3FORMS_DEFAULT_FROM_NAME,
  });
};

module.exports = {
  sendEmail,
  sendFeedbackNotification
};
