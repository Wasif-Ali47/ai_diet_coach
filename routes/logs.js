import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as logController from '../controllers/logController.js';

const router = express.Router();

router.post('/natural', authenticate, logController.logNatural);
router.post('/planned-meal', authenticate, logController.logPlannedMeal);
router.get('/history', authenticate, logController.getLogHistory);

export default router;
