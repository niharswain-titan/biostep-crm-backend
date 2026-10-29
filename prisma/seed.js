require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const B2C_CHANNELS = ['Amazon', 'Flipkart', 'Myntra'];

const clinics = [
  'HealthPlus Clinics',
  'NutriMart Retail',
  'LifeLine Hospitals',
  'FitFuel E-Commerce',
  'Wellness Warehouse',
  'BioCare Labs',
];

const leads = [
  { id: 1, name: 'Rahul Sharma', company: 'HealthPlus Clinics', email: 'rahul.sharma@healthplus.in', status: 'Qualified', value: 125000, source: 'B2B Institutional', createdAt: '2026-09-12' },
  { id: 2, name: 'Priya Nair', company: 'NutriMart Retail', email: 'priya.nair@nutrimart.com', status: 'New', value: 48000, source: 'BIOSTEP Website', createdAt: '2026-09-28' },
  { id: 3, name: 'Amit Verma', company: 'LifeLine Hospitals', email: 'amit.verma@lifeline.org', status: 'Contacted', value: 210000, source: 'B2B Institutional', createdAt: '2026-10-02' },
  { id: 4, name: 'Sneha Reddy', company: 'FitFuel E-Commerce', email: 'sneha.reddy@fitfuel.in', status: 'Converted', value: 76500, source: 'Amazon', createdAt: '2026-08-21' },
  { id: 5, name: 'Vikram Singh', company: 'Wellness Warehouse', email: 'vikram.singh@wellnesswh.in', status: 'Qualified', value: 98000, source: 'Flipkart', createdAt: '2026-10-08' },
  { id: 6, name: 'Ananya Das', company: 'BioCare Labs', email: 'ananya.das@biocare.co', status: 'New', value: 154000, source: 'B2B Institutional', createdAt: '2026-10-15' },
];

const orders = [
  { id: 'ORD-1001', partner: 'HealthPlus Clinics', channel: 'B2B Institutional', items: 12, totalAmount: 84500, status: 'Fulfilled', orderDate: '2026-10-01' },
  { id: 'ORD-1002', partner: 'NutriMart Retail', channel: 'BIOSTEP Website', items: 5, totalAmount: 23600, status: 'Processing', orderDate: '2026-10-04' },
  { id: 'ORD-1003', partner: 'LifeLine Hospitals', channel: 'B2B Institutional', items: 30, totalAmount: 156000, status: 'Fulfilled', orderDate: '2026-10-06' },
  { id: 'ORD-1004', partner: 'FitFuel E-Commerce', channel: 'Amazon', items: 8, totalAmount: 15200, status: 'Shipped', orderDate: '2026-10-09' },
  { id: 'ORD-1005', partner: 'Wellness Warehouse', channel: 'Flipkart', items: 3, totalAmount: 7800, status: 'Pending', orderDate: '2026-10-12' },
  { id: 'ORD-1006', partner: 'BioCare Labs', channel: 'B2B Institutional', items: 18, totalAmount: 99400, status: 'Fulfilled', orderDate: '2026-10-16' },
  { id: 'ORD-1007', partner: 'HealthPlus Clinics', channel: 'B2B Institutional', items: 10, totalAmount: 67200, status: 'Cancelled', orderDate: '2026-10-18' },
];

async function main() {
  await prisma.order.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.clinic.deleteMany();

  const clinicByName = {};
  for (const name of clinics) {
    const clinic = await prisma.clinic.create({ data: { name } });
    clinicByName[name] = clinic.id;
  }

  for (const lead of leads) {
    await prisma.lead.create({
      data: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        status: lead.status,
        value: lead.value,
        source: lead.source,
        createdAt: new Date(lead.createdAt),
        clinicId: clinicByName[lead.company],
      },
    });
  }

  for (const order of orders) {
    const link = {};
    if (B2C_CHANNELS.includes(order.channel)) {
      link.customerName = order.partner;
    } else {
      link.clinicId = clinicByName[order.partner];
    }

    await prisma.order.create({
      data: {
        id: order.id,
        channel: order.channel,
        items: order.items,
        totalAmount: order.totalAmount,
        status: order.status,
        orderDate: new Date(order.orderDate),
        ...link,
      },
    });
  }

  const adminEmail = 'admin@biostep.com';
  const passwordHash = await bcrypt.hash('biostep123', 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, password: passwordHash, name: 'Admin' },
  });

  console.log(
    `Seeded ${clinics.length} clinics, ${leads.length} leads, ${orders.length} orders, admin user ${admin.email}`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
