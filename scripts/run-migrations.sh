#!/bin/bash

set -e

# Migration runner script
# Usage: DATABASE_URL=postgresql://user:pass@host:port/dbname ./scripts/run-migrations.sh

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL environment variable is required"
    echo "Usage: DATABASE_URL=postgresql://user:pass@host:port/dbname ./scripts/run-migrations.sh"
    exit 1
fi

MIGRATIONS_DIR="$(dirname "$0")/../migrations"
MIGRATIONS_TABLE="schema_migrations"

echo "🔍 Checking database connection..."

# Test database connection
if ! psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "❌ Failed to connect to database"
    exit 1
fi

echo "✅ Database connection successful"

# Create schema_migrations table if it doesn't exist
echo "📋 Setting up migrations tracking table..."
psql "$DATABASE_URL" <<EOF
CREATE TABLE IF NOT EXISTS $MIGRATIONS_TABLE (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
EOF

echo "✅ Migrations tracking table ready"

# Get list of applied migrations
APPLIED_MIGRATIONS=$(psql "$DATABASE_URL" -t -c "SELECT migration_name FROM $MIGRATIONS_TABLE ORDER BY migration_name;")

# Run migrations in order
for migration_file in "$MIGRATIONS_DIR"/*.sql; do
    if [ ! -f "$migration_file" ]; then
        echo "⚠️  No migration files found in $MIGRATIONS_DIR"
        exit 0
    fi

    migration_name=$(basename "$migration_file")

    # Check if migration has already been applied
    if echo "$APPLIED_MIGRATIONS" | grep -q "$migration_name"; then
        echo "⏭️  Skipping $migration_name (already applied)"
        continue
    fi

    echo "🚀 Applying migration: $migration_name"

    # Run the migration
    psql "$DATABASE_URL" -f "$migration_file"

    # Record the migration as applied
    psql "$DATABASE_URL" -c "INSERT INTO $MIGRATIONS_TABLE (migration_name) VALUES ('$migration_name');"

    echo "✅ Applied $migration_name"
done

echo ""
echo "🎉 All migrations completed successfully!"
