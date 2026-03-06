import { Request, Response, NextFunction } from 'express';
import Transaction from '../models/Transaction';

export const getTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const transactions = await Transaction.query()
      .orderBy('createdAt', 'desc')
      .limit(100);

    res.json({
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};
