import { Request, Response, NextFunction } from 'express';
import Transaction from '../models/Transaction';

const allowedPaymentStatuses = ['pending', 'success', 'failed'] as const;

type PaymentStatus = typeof allowedPaymentStatuses[number];

export const getTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { paymentStatus } = req.params;

    if (!paymentStatus || !allowedPaymentStatuses.includes(paymentStatus as PaymentStatus)) {
      res.status(400).json({
        error: {
          message: 'Invalid paymentStatus. Expected one of: pending, success, failed',
        },
      });
      return;
    }

    const transactions = await Transaction.query()
      .where('payment_status', paymentStatus)
      .orderBy('created_at', 'desc')
      .limit(100);

    // Map to frontend format
    const formattedTransactions = transactions.map(t => t.toFrontendFormat());

    res.json({
      data: formattedTransactions,
      total: formattedTransactions.length,
    });
  } catch (error) {
    next(error);
  }
};

