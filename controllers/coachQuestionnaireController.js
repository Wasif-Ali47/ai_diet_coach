import User from '../models/User.js';
import { validationResult } from 'express-validator';
import { foodCatalog } from '../data/foodCatalog.js';

const ALLOWED_MAIN_GOALS = [
  'lose_weight',
  'lose_belly_fat',
  'maintain_weight',
  'improve_health'
];

const ALLOWED_ACTIVITY = [
  'Sedentary',
  'Lightly Active',
  'Moderately Active',
  'Very Active'
];

const ALLOWED_PACE = ['slow', 'balanced', 'fast'];

/**
 * GET /api/users/coach-questionnaire
 */
export const getCoachQuestionnaire = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      coachProfile: user.coachProfile || {},
      height: user.height,
      weight: user.weight,
      activityLevel: user.activityLevel,
      healthConditions: user.healthConditions || [],
      foodLikes: user.foodLikes || []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to load questionnaire',
      error: error.message
    });
  }
};

/**
 * GET /api/users/coach-questionnaire/food-catalog
 */
export const getFoodCatalog = async (_req, res) => {
  res.json({ success: true, catalog: foodCatalog });
};

/**
 * PUT /api/users/coach-questionnaire
 * Partial update — merges coachProfile and syncs shared User fields.
 */
export const updateCoachQuestionnaire = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const {
      mainGoal,
      age,
      heightCm,
      weight,
      targetWeight,
      preferredCuisine,
      healthConditions,
      foodRestrictions,
      likedFoods,
      activityLevel,
      weightLossPace,
      foodStyles,
      dailyRoutine,
      foodPreparer,
      weightLossProblems,
      healthConditionsOther,
      foodRestrictionsOther,
      likedFoodsOther,
      questionnaireComplete
    } = req.body;

    user.coachProfile = user.coachProfile || {};

    if (mainGoal !== undefined) {
      if (!ALLOWED_MAIN_GOALS.includes(mainGoal)) {
        return res.status(400).json({ success: false, message: 'Invalid mainGoal' });
      }
      user.coachProfile.mainGoal = mainGoal;
    }
    if (age !== undefined) user.coachProfile.age = age;
    if (targetWeight !== undefined) user.coachProfile.targetWeight = targetWeight;
    if (preferredCuisine !== undefined) user.coachProfile.preferredCuisine = preferredCuisine;
    if (foodRestrictions !== undefined) user.coachProfile.foodRestrictions = foodRestrictions;
    if (likedFoods !== undefined) {
      user.coachProfile.likedFoods = likedFoods;
      user.foodLikes = likedFoods;
    }
    if (weightLossPace !== undefined) {
      if (!ALLOWED_PACE.includes(weightLossPace)) {
        return res.status(400).json({ success: false, message: 'Invalid weightLossPace' });
      }
      user.coachProfile.weightLossPace = weightLossPace;
    }
    if (foodStyles !== undefined) user.coachProfile.foodStyles = foodStyles;
    if (dailyRoutine !== undefined) user.coachProfile.dailyRoutine = dailyRoutine;
    if (foodPreparer !== undefined) user.coachProfile.foodPreparer = foodPreparer;
    if (weightLossProblems !== undefined) user.coachProfile.weightLossProblems = weightLossProblems;
    if (healthConditionsOther !== undefined) user.coachProfile.healthConditionsOther = healthConditionsOther;
    if (foodRestrictionsOther !== undefined) user.coachProfile.foodRestrictionsOther = foodRestrictionsOther;
    if (likedFoodsOther !== undefined) user.coachProfile.likedFoodsOther = likedFoodsOther;
    if (questionnaireComplete !== undefined) {
      user.coachProfile.questionnaireComplete = questionnaireComplete;
    }

    if (heightCm !== undefined) {
      user.height = { cm: parseFloat(heightCm) };
    }
    if (weight !== undefined) user.weight = weight;
    if (activityLevel !== undefined) {
      if (!ALLOWED_ACTIVITY.includes(activityLevel)) {
        return res.status(400).json({ success: false, message: 'Invalid activityLevel' });
      }
      user.activityLevel = activityLevel;
      user.coachProfile.activityLevel = activityLevel;
    }
    if (healthConditions !== undefined) {
      user.healthConditions = healthConditions;
    }

    // Map restrictions into dietPreferences flags for meal-plan compatibility
    if (foodRestrictions !== undefined) {
      const restrictions = new Set(foodRestrictions);
      user.dietPreferences = user.dietPreferences || {};
      user.dietPreferences.vegetarian = restrictions.has('vegetarian');
      user.dietPreferences.vegan = restrictions.has('vegan');
      user.dietPreferences.glutenFree = restrictions.has('gluten_free');
      user.dietPreferences.dairyFree = restrictions.has('dairy_free');
      const allergyKeys = ['nut_free', 'shellfish_free'];
      user.dietPreferences.allergies = foodRestrictions.filter((r) => allergyKeys.includes(r));
    }

    if (foodStyles !== undefined) {
      user.localFoodPreferences = foodStyles;
    }

    await user.save();

    const updated = await User.findById(req.userId).select('-password');
    res.json({
      success: true,
      message: 'Questionnaire updated',
      user: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update questionnaire',
      error: error.message
    });
  }
};
