import { Model } from 'objection';
import { getKnex } from './knex';

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
    return FeesModel.query().orderBy('createdAt', 'desc');
  }

  static async getFeeById(feeId: string): Promise<FeesModel | undefined> {
    await getKnex();
    return FeesModel.query().findById(feeId) || undefined;
  }
}
