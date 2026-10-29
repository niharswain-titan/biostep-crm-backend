const express = require('express');
const cors = require('cors');
require('dotenv').config();

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Add it to .env before starting the server.');
}

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add your PostgreSQL connection string to .env.');
}

app.use(cors());
app.use(express.json());

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const toISODate = (d) => new Date(d).toISOString().slice(0, 10);
const B2C_CHANNELS = ['Amazon', 'Flipkart', 'Myntra'];

const leadShape = (l) => ({
  id: l.id,
  name: l.name,
  company: l.clinic.name,
  email: l.email,
  status: l.status,
  value: l.value,
  source: l.source,
  createdAt: toISODate(l.createdAt),
});

const orderShape = (o) => ({
  id: o.id,
  partner: o.clinic ? o.clinic.name : o.customerName,
  channel: o.channel,
  items: o.items,
  totalAmount: o.totalAmount,
  status: o.status,
  orderDate: toISODate(o.orderDate),
});

const asyncHandler = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Bearer token required' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const dashboardData = {
  totalRevenue: 642800,
  fulfilledOrders: 156,
  activePartners: 38,
  leads: {
    total: 112,
    conversionRate: '44.17%',
  },
  salesChannels: [
    { name: 'B2B Institutional', revenue: 398500, percentage: 62 },
    { name: 'BIOSTEP Website', revenue: 145000, percentage: 23 },
    { name: 'Amazon', revenue: 64800, percentage: 10 },
    { name: 'Flipkart', revenue: 34500, percentage: 5 },
  ],
};

app.get('/api/dashboard', (req, res) => {
  res.json(dashboardData);
});

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user && (await bcrypt.compare(password, user.password));

    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '24h',
    });

    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  })
);

app.get(
  '/api/leads',
  requireAuth,
  asyncHandler(async (req, res) => {
    const leads = await prisma.lead.findMany({
      include: { clinic: true },
      orderBy: { id: 'asc' },
    });
    res.json(leads.map(leadShape));
  })
);

app.post(
  '/api/leads',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, company, email, status, value, source } = req.body || {};

    if (!name || !company || !email) {
      return res.status(400).json({ error: 'name, company and email are required' });
    }

    const clinic = await prisma.clinic.upsert({
      where: { name: company },
      update: {},
      create: { name: company },
    });

    const lead = await prisma.lead.create({
      data: {
        name,
        email,
        status: status || 'New',
        value: Number(value) || 0,
        source: source || 'BIOSTEP Website',
        createdAt: new Date(),
        clinicId: clinic.id,
      },
      include: { clinic: true },
    });

    res.status(201).json(leadShape(lead));
  })
);

app.get(
  '/api/orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      include: { clinic: true },
      orderBy: { id: 'asc' },
    });
    res.json(orders.map(orderShape));
  })
);

app.post(
  '/api/orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { partner, channel, items, totalAmount, status, orderDate } = req.body || {};

    if (!partner || !channel || items == null || totalAmount == null) {
      return res
        .status(400)
        .json({ error: 'partner, channel, items and totalAmount are required' });
    }

    const itemsCount = Number(items);
    const amount = Number(totalAmount);
    if (Number.isNaN(itemsCount) || Number.isNaN(amount)) {
      return res.status(400).json({ error: 'items and totalAmount must be numbers' });
    }

    const existing = await prisma.order.findMany({ select: { id: true } });
    const maxId = existing
      .map((o) => parseInt(o.id.split('-')[1], 10))
      .filter((n) => !Number.isNaN(n))
      .reduce((max, n) => Math.max(max, n), 1000);
    const id = `ORD-${maxId + 1}`;

    const link = {};
    if (B2C_CHANNELS.includes(channel)) {
      link.customerName = partner;
    } else {
      const clinic = await prisma.clinic.upsert({
        where: { name: partner },
        update: {},
        create: { name: partner },
      });
      link.clinicId = clinic.id;
    }

    const order = await prisma.order.create({
      data: {
        id,
        channel,
        items: itemsCount,
        totalAmount: amount,
        status: status || 'Pending',
        orderDate: orderDate ? new Date(orderDate) : new Date(),
        ...link,
      },
      include: { clinic: true },
    });

    res.status(201).json(orderShape(order));
  })
);

const omnichannelInboxData = {
  whatsappNumber: '9777408006',
  conversations: [],
};

app.get('/api/omnichannel/inbox', (req, res) => {
  res.json(omnichannelInboxData);
});

app.listen(PORT, () => {
  console.log(`BIOSTEP server running on http://localhost:${PORT}`);
});
