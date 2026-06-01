import User from '../models/User.js';
import MealPlan from '../models/MealPlan.js';
import { getMessaging } from '../utils/firebaseAdminInit.js';

/**
 * Get all users for admin dashboard
 */
export const getUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = users.map((u) => ({
      id: u._id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      healthConditions: u.healthConditions || [],
      onboardingComplete: u.onboardingComplete || false,
      active: u.active !== false, // default true if not set
    }));

    res.json({
      success: true,
      users: formatted,
    });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message,
    });
  }
};

/**
 * Toggle user active/deactivated
 */
export const toggleUserActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    console.log('[toggleUserActive] Request received:', { id, active });

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { active: !!active },
      { new: true }
    ).select('-password');

    if (!user) {
      console.log('[toggleUserActive] User not found:', id);
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    console.log('[toggleUserActive] User updated successfully:', {
      id: user._id,
      email: user.email,
      active: user.active,
    });

    res.json({
      success: true,
      message: `User ${active ? 'activated' : 'deactivated'} successfully`,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        active: user.active,
      },
    });
  } catch (error) {
    console.error('[toggleUserActive] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: error.message,
    });
  }
};

/**
 * Get all meal plans for admin view
 */
export const getAllMealPlans = async (req, res) => {
  try {
    const plans = await MealPlan.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const formatted = plans.map((p) => ({
      id: p._id,
      userId: p.userId,
      planName: p.planName,
      startDate: p.startDate,
      endDate: p.endDate,
      dailyCalorieTarget: p.dailyCalorieTarget,
      dailyMacroTargets: p.dailyMacroTargets,
      isActive: p.isActive,
    }));

    res.json({
      success: true,
      mealPlans: formatted,
    });
  } catch (error) {
    console.error('Admin get meal plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meal plans',
      error: error.message,
    });
  }
};

/**
 * Broadcast push notification to all users with registered device tokens
 */
export const broadcastNotification = async (req, res) => {
  console.log('[broadcastNotification] Function called');
  try {
    const messaging = getMessaging();
    if (!messaging) {
      console.log('[broadcastNotification] Firebase Admin not initialized - returning 503');
      return res.status(503).json({
        success: false,
        message: 'Push notifications not configured. Place firebase-service-account.json in backend/ or set FIREBASE_SERVICE_ACCOUNT.',
      });
    }

    const { title, body } = req.body || {};
    console.log('[broadcastNotification] Extracted title and body:', { title, body });

    if (!title || !body) {
      console.log('[broadcastNotification] Missing title or body - returning 400');
      return res.status(400).json({
        success: false,
        message: 'Title and body are required',
      });
    }

    console.log('[broadcastNotification] Admin broadcast notification requested:', {
      title,
      body,
    });

    // Fetch all active users that have at least one registered device token
    console.log('[broadcastNotification] Querying users with device tokens...');
    const usersWithTokens = await User.find({
      'deviceTokens.0': { $exists: true },
      $or: [{ active: { $exists: false } }, { active: true }],
    }).select('deviceTokens');
    console.log('[broadcastNotification] Query completed, found users:', usersWithTokens.length);

    const tokensSet = new Set();
    usersWithTokens.forEach((user) => {
      (user.deviceTokens || []).forEach((dt) => {
        if (dt?.token) {
          tokensSet.add(dt.token);
        }
      });
    });

    const allTokens = Array.from(tokensSet);

    console.log('[broadcastNotification] Found users with tokens:', usersWithTokens.length);
    console.log('[broadcastNotification] Total unique device tokens:', allTokens.length);

    if (allTokens.length === 0) {
      console.log('[broadcastNotification] No tokens found - returning success with message');
      return res.status(200).json({
        success: true,
        message: 'No device tokens found. Notification not sent. Users need to open the app at least once to register their device tokens.',
        totalTokens: 0,
        successCount: 0,
        failureCount: 0,
      });
    }

    // FCM allows up to 500 tokens per multicast request
    const chunkSize = 500;
    let totalSuccess = 0;
    let totalFailure = 0;

    for (let i = 0; i < allTokens.length; i += chunkSize) {
      const chunk = allTokens.slice(i, i + chunkSize);

      const message = {
        notification: {
          title,
          body,
        },
        data: {
          type: 'broadcast',
        },
        tokens: chunk,
      };

      try {
        const response = await messaging.sendEachForMulticast(message);
        totalSuccess += response.successCount || 0;
        totalFailure += response.failureCount || 0;

        console.log('[broadcastNotification] Chunk result:', {
          sent: chunk.length,
          success: response.successCount,
          failure: response.failureCount,
        });
      } catch (err) {
        console.error('[broadcastNotification] Firebase messaging error for chunk:', err);
        totalFailure += chunk.length;
      }
    }

    console.log('[broadcastNotification] Sending success response');
    return res.json({
      success: true,
      message: 'Broadcast notification sent',
      totalTokens: allTokens.length,
      successCount: totalSuccess,
      failureCount: totalFailure,
    });
  } catch (error) {
    console.error('[broadcastNotification] Admin broadcast notification error:', error);
    console.error('[broadcastNotification] Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message,
    });
  }
};

