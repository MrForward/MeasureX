import { PrismaClient } from '@prisma/client';

/**
 * Singleton Prisma client. Prevents exhausting database connections in
 * development where hot-reload would otherwise create a new client per reload.
 */
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const db =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = db;
}
