import type { Knex } from 'knex';

/**
 * This seed file has been superseded by seeder.ts, which seeds both fees and
 * transactions in the correct dependency order. This file is intentionally a
 * no-op to avoid conflicts when Knex runs all seed files alphabetically.
 */
export async function seed(_knex: Knex): Promise<void> {}
