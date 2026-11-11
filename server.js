require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'success', message: 'BIOSTEP CRM API is running!' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:3000`);
});
