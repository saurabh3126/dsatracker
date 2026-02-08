const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const { requireAuth } = require('../middleware/requireAuth');
const { sendFeedbackNotification } = require('../services/emailService');

// POST /api/feedback
router.post('/', requireAuth, async (req, res) => {
  try {
    const { type, message } = req.body;
    
    if (!type || !message) {
      return res.status(400).json({ error: 'Type and message are required' });
    }

    console.log('Feedback received', {
      type,
      hasMessage: Boolean(String(message || '').trim()),
      userId: req.user?._id || null,
    });

    let saved = false;
    try {
      const feedback = new Feedback({
        type,
        message,
        // If user is logged in (optional depending on middleware usage)
        userId: req.user?._id || null,
      });

      await feedback.save();
      saved = true;
    } catch (dbErr) {
      console.error('Feedback save failed (continuing to email):', dbErr?.message || dbErr);
    }

    // Send email notification to admin
    try {
      const emailResult = await sendFeedbackNotification({
        type,
        message,
        userId: req.user?._id,
        userName: req.user?.name,
        userEmail: req.user?.email,
      });
      console.log('Feedback email result', emailResult);
    } catch (emailErr) {
      console.error('Email notification failed but feedback was saved:', emailErr);
    }

    res.status(201).json({ message: 'Feedback submitted successfully', saved });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

module.exports = router;
