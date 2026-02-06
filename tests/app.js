
const express = require('express');
const app = express();
app.use(express.json());

app.get('/api/users', (req, res) => {
  res.status(200).json([{ id: 1, name: 'John Doe' }]);
});

app.post('/api/users', (req, res) => {
  res.status(201).json({ id: 2, ...req.body });
});

module.exports = app;
