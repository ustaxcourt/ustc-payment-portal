import { Request, Response, NextFunction } from 'express';
import Transaction from '../models/Transaction';

export const getTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const transactions = await Transaction.query()
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

