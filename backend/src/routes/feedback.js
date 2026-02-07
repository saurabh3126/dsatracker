const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const { requireAuth } = require('../middleware/requireAuth');
const { sendFeedbackNotification } = require('../services/emailService');

// POST /api/feedback
router.post('/', async (req, res) => {
  try {
    const { type, message } = req.body;
    
    if (!type || !message) {
      return res.status(400).json({ error: 'Type and message are required' });
    }

    const feedback = new Feedback({
      type,
      message,
      // If user is logged in (optional depending on middleware usage)
      userId: req.user?._id || null
    });

    await feedback.save();

    // Send email notification via Brevo
    try {
      await sendFeedbackNotification({
        type,
        message,
        userId: req.user?._id
      });
    } catch (emailErr) {
      console.error('Email notification failed but feedback was saved:', emailErr);
    }
    
    res.status(201).json({ message: 'Feedback submitted successfully' });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

module.exports = router;
