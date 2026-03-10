import { Router } from 'express';
import { getTransactionPaymentStatus, getTransactions, getAllTransactions } from '../controllers/transactions.controller';

const router = Router();

router.get('/transactions', getAllTransactions);
router.get('/transactions/:paymentStatus', getTransactions);
router.get('/transaction-payment-status', getTransactionPaymentStatus);

export default router;
