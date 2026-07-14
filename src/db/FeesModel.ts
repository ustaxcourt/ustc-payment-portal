import { Model } from 'objection';
import { getKnex } from './knex';

/**
 * @deprecated Fees have been refactored out of the database and are now hardcoded in the codebase.
 * Use getFeeById and getActiveFeeByKey from `src/config/fees` instead of querying FeesModel.
 */
export default class FeesModel extends Model {
  feeId!: string; // e.g. "PETITION_FILING_FEE_2026_03_05"
  feeKey!: string; // e.g. "PETITION_FILING_FEE"
  name!: string;
  tcsAppId!: string;
  isVariable!: boolean;
  amount?: number | null;
  description?: string | null;
  activationDate!: string;
  createdAt!: string;
  updatedAt!: string;

  /* istanbul ignore next */
  static get tableName() {
    return 'fees';
  }

  /* istanbul ignore next */
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

  static async getActiveFeeByKey(feeKey: string): Promise<FeesModel | undefined> {
    await getKnex();
    return FeesModel.query()
      .where('feeKey', feeKey)
      .where('activationDate', '<=', new Date().toISOString())
      .orderBy('activationDate', 'desc')
      .first();
  }
}
