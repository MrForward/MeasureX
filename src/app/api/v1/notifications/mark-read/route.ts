import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api/response';
import { getServerSession } from '@/lib/auth/utils';

/**
 * POST /api/v1/notifications/mark-read
 *
 * Marks all of the signed-in user's unread notifications as read.
 *
 * Requirement 6.5 (in-app notification system)
 */
export async function POST() {
    const session = await getServerSession();
    const userId = session?.user?.id;
    if (!userId) {
        return apiError('Unauthorized', 'UNAUTHORIZED', 401);
    }

    const result = await db.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
    });

    return apiSuccess({ markedRead: result.count });
}
