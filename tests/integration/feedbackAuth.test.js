const request = require('supertest');

// Mock auth middleware so we can deterministically verify that the feedback route
// is protected without needing a real DB + JWT setup.
jest.mock('../../backend/src/middleware/requireAuth', () => ({
  requireAuth: (req, res, next) => {
    const header = req.headers.authorization || req.headers.Authorization;
    if (!header) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { _id: 'test-user-id' };
    return next();
  },
}));

// Avoid side effects in case the route is ever changed to allow anonymous access.
jest.mock('../../backend/src/models/Feedback', () => {
  return function Feedback() {
    this.save = async () => ({ ok: true });
  };
});

jest.mock('../../backend/src/services/emailService', () => ({
  sendFeedbackNotification: async () => ({ ok: true }),
}));

describe('Feedback auth', () => {
  it('POST /api/feedback should require login', async () => {
    const express = require('express');
    const feedbackRoutes = require('../../backend/src/routes/feedback');

    const app = express();
    app.use(express.json());
    app.use('/api/feedback', feedbackRoutes);

    const response = await request(app)
      .post('/api/feedback')
      .send({ type: 'suggestion', message: 'hello' });

    expect(response.statusCode).toBe(401);
  });
});
