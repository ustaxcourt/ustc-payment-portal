import { Model } from 'objection';

export default class FeesModel extends Model {
  feeId!: string;
  feeName!: string;
  tcsAppId!: string;
  isVariable!: boolean;
  amount?: number | null;
  description?: string | null;
  createdAt!: string;
  lastUpdatedAt!: string;

  static get tableName() {
    return 'fees';
  }

  static get idColumn() {
    return 'feeId';
  }

  static get relationMappings() {
    return {
      transactions: {
        relation: Model.HasManyRelation,
        modelClass: 'TransactionModel',
        join: {
          from: 'fees.feeId',
          to: 'transactions.feeId',
        },
      },
    };
  }

  static getAll() {
    return FeesModel.query().orderBy('created_at', 'desc');
  }

  static async getFeeById(feeId: string): Promise<FeesModel | undefined> {
    return FeesModel.query().findById(feeId);
  }
}
