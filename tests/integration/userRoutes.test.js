const request = require('supertest');
const app = require('./app');  
describe('User Routes', () => {
  it('GET /api/users should return 200', async () => {
    const response = await request(app).get('/api/users');
    expect(response.statusCode).toBe(200);
    // Optionally: expect(response.body).toBeInstanceOf(Array);
  });

  it('POST /api/users should create a new user', async () => {
    const mockUser = {
      name: 'Test User',
      email: 'test@example.com',
      password: '123456',
    };

    const response = await request(app)
      .post('/api/users')
      .send(mockUser)
      .set('Accept', 'application/json');

    expect(response.statusCode).toBe(201);  
    expect(response.body).toHaveProperty('id');
  });
});
