import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { getServerSession } from '@/lib/auth/utils';

/**
 * GET /api/v1/notifications
 *
 * Returns the signed-in user's most recent notifications plus the unread count,
 * for the in-app notification bell. User-scoped (a user sees only their own).
 *
 * Requirement 6.5 (in-app notification system)
 */
export async function GET() {
    const session = await getServerSession();
    const userId = session?.user?.id;
    if (!userId) {
        return apiError('Unauthorized', 'UNAUTHORIZED', 401);
    }

    const [notifications, unreadCount] = await Promise.all([
        db.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { id: true, type: true, content: true, read: true, createdAt: true },
        }),
        db.notification.count({ where: { userId, read: false } }),
    ]);

    return apiSuccess({ notifications, unreadCount });
}
