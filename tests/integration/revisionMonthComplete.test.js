const request = require('supertest');

jest.mock('../../backend/src/middleware/requireAuth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { _id: 'test-user-id' };
    next();
  },
}));

jest.mock('mongoose', () => {
  class ObjectId {
    constructor(value) {
      this.value = value;
    }
    toString() {
      return String(this.value);
    }
  }

  return {
    connection: { readyState: 1 },
    Types: { ObjectId },
  };
});

const mockSave = jest.fn(async () => ({}));
const mockToObject = jest.fn(() => ({
  source: 'leetcode',
  ref: 'two-sum',
  title: 'Two Sum',
  difficulty: 'Easy',
  link: 'https://leetcode.com/problems/two-sum/',
}));

const mockRevisionItem = {
  findOne: jest.fn(async () => ({
    _id: 'item-id',
    userId: 'test-user-id',
    questionKey: 'leetcode:two-sum',
    source: 'leetcode',
    ref: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    link: 'https://leetcode.com/problems/two-sum/',
    bucket: 'month',
    save: mockSave,
    toObject: mockToObject,
  })),
  deleteOne: jest.fn(async () => ({ deletedCount: 1 })),
  find: jest.fn(async () => []),
  deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
};

jest.mock('../../backend/src/models/RevisionItem', () => mockRevisionItem);

const mockMonthlyRevisionArchive = {
  bulkWrite: jest.fn(async () => ({ ok: 1 })),
  find: jest.fn(async () => []),
};

jest.mock('../../backend/src/models/MonthlyRevisionArchive', () => mockMonthlyRevisionArchive);

jest.mock('../../backend/src/services/leetcodeClient', () => ({
  fetchQuestionDetails: async () => null,
  fetchRecentAcceptedSubmissions: async () => [],
}));

describe('Revision month completion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /api/revision/items/:id/complete (scope=month) archives and removes the item', async () => {
    const express = require('express');
    const revisionRoutes = require('../../backend/src/routes/revision');

    const app = express();
    app.use(express.json());
    app.use('/api/revision', revisionRoutes);

    const res = await request(app)
      .post('/api/revision/items/item-id/complete')
      .send({ scope: 'month' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ deleted: true, archived: true });

    expect(mockMonthlyRevisionArchive.bulkWrite).toHaveBeenCalledTimes(1);
    expect(mockRevisionItem.deleteOne).toHaveBeenCalledWith({ _id: 'item-id', userId: expect.anything() });
  });
});
