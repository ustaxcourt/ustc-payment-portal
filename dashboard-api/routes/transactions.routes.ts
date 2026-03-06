import { Router } from 'express';
import { getTransactions } from '../controllers/transactions.controller';

const router = Router();

router.get('/transactions/:paymentStatus', getTransactions);

export default router;
