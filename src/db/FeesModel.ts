import { Model } from 'objection';
import { getKnex } from './knex';

export default class FeesModel extends Model {
  feeId!: string;
  name!: string;
  tcsAppId!: string;
  isVariable!: boolean;
  amount?: number | null;
  description?: string | null;
  createdAt!: string;
  updatedAt!: string;

  static get tableName() {
    return 'fees';
  }

  static get idColumn() {
    return 'feeId';
  }

  $parseDatabaseJson(json: Record<string, unknown>): Record<string, unknown> {
    const parsed = super.$parseDatabaseJson(json);

    if (parsed.amount !== undefined && parsed.amount !== null) {
      parsed.amount = Number(parsed.amount);
    }

    return parsed;
  }

  static get relationMappings() {
    // Lazy require to break the circular dependency with TransactionModel
    const TransactionModel = require('./TransactionModel').default;
    return {
      transactions: {
        relation: Model.HasManyRelation,
        modelClass: TransactionModel,
        join: {
          from: 'fees.feeId',
          to: 'transactions.feeId',
        },
      },
    };
  }

  static async getAll() {
    await getKnex();
    return FeesModel.query().orderBy('createdAt', 'desc');
  }

  static async getFeeById(feeId: string): Promise<FeesModel | undefined> {
    await getKnex();
    return FeesModel.query().findById(feeId) || undefined;
  }
}
