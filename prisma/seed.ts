import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@jktech.com' },
    update: {},
    create: {
      email: 'admin@jktech.com',
      password: adminPassword,
      name: 'Admin User',
      role: 'admin',
      isActive: true,
    },
  });

  console.log('✅ Created admin user:', admin.email);

  // Create moderator user
  const moderatorPassword = await bcrypt.hash('moderator123', 12);
  const moderator = await prisma.user.upsert({
    where: { email: 'moderator@jktech.com' },
    update: {},
    create: {
      email: 'moderator@jktech.com',
      password: moderatorPassword,
      name: 'Moderator User',
      role: 'moderator',
      isActive: true,
    },
  });

  console.log('✅ Created moderator user:', moderator.email);

  // Create regular user
  const userPassword = await bcrypt.hash('user123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'user@jktech.com' },
    update: {},
    create: {
      email: 'user@jktech.com',
      password: userPassword,
      name: 'Regular User',
      role: 'user',
      isActive: true,
    },
  });

  console.log('✅ Created regular user:', user.email);

  console.log('🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });