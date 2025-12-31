import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from 'prisma/config';
import { ProductAttributeType } from '../generated/prisma/enums';

type Env = {
  DATABASE_URL: string;
};

const pool = new PrismaPg({
  connectionString: env<Env>('DATABASE_URL'),
});

const prisma = new PrismaClient({ adapter: pool });

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data (optional - be careful in production)
  console.log('🧹 Cleaning existing data...');
  await prisma.paymentDetails.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.orderDetails.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.productSkus.deleteMany();
  await prisma.productAttribute.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany();

  // Seed Categories
  console.log('📁 Creating categories...');
  const electronicsCategory = await prisma.category.create({
    data: {
      name: 'Electronics',
      description: 'Electronic devices and accessories',
    },
  });

  const clothingCategory = await prisma.category.create({
    data: {
      name: 'Clothing',
      description: 'Apparel and fashion items',
    },
  });

  const phonesCategory = await prisma.category.create({
    data: {
      name: 'Smartphones',
      description: 'Mobile phones and accessories',
      parentCategoryId: electronicsCategory.id,
    },
  });

  const laptopsCategory = await prisma.category.create({
    data: {
      name: 'Laptops',
      description: 'Laptop computers and accessories',
      parentCategoryId: electronicsCategory.id,
    },
  });

  const shirtsCategory = await prisma.category.create({
    data: {
      name: 'Shirts',
      description: 'T-shirts, dress shirts, and casual shirts',
      parentCategoryId: clothingCategory.id,
    },
  });

  // Seed Users
  console.log('👤 Creating users...');
  const user1 = await prisma.user.create({
    data: {
      firstName: 'John',
      lastName: 'Doe',
      username: 'johndoe',
      email: 'john.doe@example.com',
      password: '$2b$10$hashedpasswordexample', // In production, use proper hashing
      phoneNumber: '+1234567890',
      birthOfDate: new Date('1990-01-15'),
      createdBy: 'system',
      updatedBy: 'system',
    },
  });

  const user2 = await prisma.user.create({
    data: {
      firstName: 'Jane',
      lastName: 'Smith',
      username: 'janesmith',
      email: 'jane.smith@example.com',
      password: '$2b$10$hashedpasswordexample',
      phoneNumber: '+1234567891',
      birthOfDate: new Date('1992-05-20'),
      createdBy: 'system',
      updatedBy: 'system',
    },
  });

  // Seed Addresses
  console.log('📍 Creating addresses...');
  await prisma.address.create({
    data: {
      userId: user1.id,
      address: '123 Main Street',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'USA',
      timeZone: 'America/New_York',
    },
  });

  await prisma.address.create({
    data: {
      userId: user2.id,
      address: '456 Oak Avenue',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90001',
      country: 'USA',
      timeZone: 'America/Los_Angeles',
    },
  });

  // Seed Products
  console.log('🛍️  Creating products...');
  const now = new Date();
  const product1 = await prisma.product.create({
    data: {
      name: 'iPhone 15 Pro',
      description: 'Latest iPhone with advanced features and A17 Pro chip',
      summary: 'Premium smartphone with titanium design',
      imageUrl: 'https://example.com/images/iphone15pro.jpg',
      price: 999.99,
      categoryId: phonesCategory.id,
      updatedAt: now,
    },
  });

  await prisma.product.create({
    data: {
      name: 'MacBook Pro 16"',
      description: 'Powerful laptop for professionals with M3 Max chip',
      summary: 'High-performance laptop for creative professionals',
      imageUrl: 'https://example.com/images/macbookpro.jpg',
      price: 2499.99,
      categoryId: laptopsCategory.id,
      updatedAt: now,
    },
  });

  const product3 = await prisma.product.create({
    data: {
      name: 'Classic White T-Shirt',
      description: 'Comfortable cotton t-shirt in classic white color',
      summary: 'Essential wardrobe staple',
      imageUrl: 'https://example.com/images/tshirt.jpg',
      price: 19.99,
      categoryId: shirtsCategory.id,
      updatedAt: now,
    },
  });

  // Seed Product Attributes
  console.log('🎨 Creating product attributes...');
  const colorRed = await prisma.productAttribute.create({
    data: {
      productId: product3.id,
      type: ProductAttributeType.COLOR,
      value: 'Red',
      updatedAt: now,
    },
  });

  const colorBlue = await prisma.productAttribute.create({
    data: {
      productId: product3.id,
      type: ProductAttributeType.COLOR,
      value: 'Blue',
      updatedAt: now,
    },
  });

  const sizeSmall = await prisma.productAttribute.create({
    data: {
      productId: product3.id,
      type: ProductAttributeType.SIZE,
      value: 'Small',
      updatedAt: now,
    },
  });

  const sizeMedium = await prisma.productAttribute.create({
    data: {
      productId: product3.id,
      type: ProductAttributeType.SIZE,
      value: 'Medium',
      updatedAt: now,
    },
  });

  const sizeLarge = await prisma.productAttribute.create({
    data: {
      productId: product3.id,
      type: ProductAttributeType.SIZE,
      value: 'Large',
      updatedAt: now,
    },
  });

  // Seed Product SKUs
  console.log('📦 Creating product SKUs...');
  await prisma.productSkus.create({
    data: {
      productId: product3.id,
      sku: 'TSHIRT-RED-SM',
      colorAttributeId: colorRed.id,
      sizeAttributeId: sizeSmall.id,
      price: 19.99,
      quantity: 50,
      updatedAt: now,
    },
  });

  await prisma.productSkus.create({
    data: {
      productId: product3.id,
      sku: 'TSHIRT-RED-MD',
      colorAttributeId: colorRed.id,
      sizeAttributeId: sizeMedium.id,
      price: 19.99,
      quantity: 75,
      updatedAt: now,
    },
  });

  await prisma.productSkus.create({
    data: {
      productId: product3.id,
      sku: 'TSHIRT-BLUE-LG',
      colorAttributeId: colorBlue.id,
      sizeAttributeId: sizeLarge.id,
      price: 19.99,
      quantity: 30,
      updatedAt: now,
    },
  });

  // Seed Carts
  console.log('🛒 Creating carts...');
  const cart1 = await prisma.cart.create({
    data: {
      userId: user1.id,
      total: 39.98,
      updatedAt: now,
    },
  });

  // Seed Cart Items
  console.log('🛒 Creating cart items...');
  await prisma.cartItem.create({
    data: {
      cartId: cart1.id,
      productId: product3.id,
      quantity: 2,
      price: 19.99,
      total: 39.98,
      updatedAt: now,
    },
  });

  // Seed Orders
  console.log('📋 Creating orders...');
  const order1 = await prisma.orderDetails.create({
    data: {
      userId: user1.id,
      total: 1019.98,
      updatedAt: now,
    },
  });

  // Seed Order Items
  console.log('📋 Creating order items...');
  await prisma.orderItem.create({
    data: {
      orderId: order1.id,
      productId: product1.id,
      quantity: 1,
      price: 999.99,
      total: 999.99,
      updatedAt: now,
    },
  });

  await prisma.orderItem.create({
    data: {
      orderId: order1.id,
      productId: product3.id,
      quantity: 1,
      price: 19.99,
      total: 19.99,
      updatedAt: now,
    },
  });

  // Seed Payment Details
  console.log('💳 Creating payment details...');
  await prisma.paymentDetails.create({
    data: {
      orderId: order1.id,
      amount: 1019.98,
      status: 'COMPLETED',
      updatedAt: now,
    },
  });

  console.log('✅ Database seed completed successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error seeding database:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
