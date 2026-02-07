const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'noreply@dsatracker.com';
const BREVO_ADMIN_EMAIL = process.env.BREVO_ADMIN_EMAIL;

/**
 * Sends an email using Brevo API
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.htmlContent - Email body in HTML
 */
const sendEmail = async ({ to, subject, htmlContent }) => {
  if (!BREVO_API_KEY) {
    console.warn('BREVO_API_KEY is not set. Skipping email sending.');
    return;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { email: BREVO_SENDER_EMAIL, name: 'DSA Tracker' },
        to: [{ email: to }],
        subject: subject,
        htmlContent: htmlContent
      })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Failed to send email via Brevo');
    }
    return result;
  } catch (error) {
    console.error('Brevo Email Error:', error);
    throw error;
  }
};

/**
 * Sends feedback notification to admin
 * @param {Object} feedback - { type, message, userId }
 */
const sendFeedbackNotification = async (feedback) => {
  if (!BREVO_ADMIN_EMAIL) return;

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
    to: BREVO_ADMIN_EMAIL,
    subject,
    htmlContent
  });
};

module.exports = {
  sendEmail,
  sendFeedbackNotification
};
