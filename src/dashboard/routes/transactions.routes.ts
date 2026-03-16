import { Router } from 'express';
import {
  getRecentTransactions,
  getTransactionsByStatus,
  getTransactionPaymentStatus,
  isValidPaymentStatus,
} from '../../useCases/transactions';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    res.json(await getRecentTransactions());
  } catch (err) {
    next(err);
  }
});

router.get('/:paymentStatus', async (req, res, next) => {
  const { paymentStatus } = req.params;

  if (!isValidPaymentStatus(paymentStatus)) {
    res.status(400).json({
      error: {
        message: 'Invalid paymentStatus. Expected one of: pending, success, failed',
      },
    });
    return;
  }

  try {
    res.json(await getTransactionsByStatus(paymentStatus));
  } catch (err) {
    next(err);
  }
});

export default router;
