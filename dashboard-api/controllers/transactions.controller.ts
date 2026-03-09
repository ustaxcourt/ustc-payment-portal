import { Request, Response, NextFunction } from 'express';
import TransactionModel, { PaymentStatus } from '../models/TransactionModel';

const allowedPaymentStatuses = ['pending', 'success', 'failed'] as const;

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

    const transactions: TransactionModel[] = await TransactionModel.getByPaymentStatus(paymentStatus as PaymentStatus);

    res.json({
      data: transactions,
      total: transactions.length,
    });
  } catch (error) {
    next(error);
  }
};

export const getTransactionPaymentStatus = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const totals = await TransactionModel.getAggregatedPaymentStatus();
    res.json(totals);
  } catch (error) {
    next(error);
  }
};

