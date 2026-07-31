<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Snapping two cabinets flush (see KitchenAssemblyScene's snapToNeighbor)
// computes an exact floating-point position — x/z were stored as `integer`,
// so the frontend rounded each module's position independently on save
// (Math.round in services/api.ts). Two neighbors that were touching exactly
// could each round a different direction and end up up to ~1cm apart (or
// overlapping) after a save/reload. Widening x/z to a real decimal column
// lets the frontend keep centimeter-and-a-fraction precision through the
// round trip instead.
//
// No `->change()` here (would need doctrine/dbal, not installed) — Postgres
// gets a real `ALTER COLUMN ... TYPE` via raw SQL (safe, widening, no data
// loss). SQLite has no ALTER COLUMN TYPE at all, but its type-affinity rules
// already store a non-integer value inserted into an "integer" column as
// REAL rather than truncating it, so the existing declared type there is
// harmless to leave as-is — nothing to do for that driver.
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE kitchen_modules ALTER COLUMN x TYPE DECIMAL(8,2) USING x::DECIMAL(8,2)');
            DB::statement('ALTER TABLE kitchen_modules ALTER COLUMN z TYPE DECIMAL(8,2) USING z::DECIMAL(8,2)');
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE kitchen_modules ALTER COLUMN x TYPE INTEGER USING ROUND(x)::INTEGER');
            DB::statement('ALTER TABLE kitchen_modules ALTER COLUMN z TYPE INTEGER USING ROUND(z)::INTEGER');
        }
    }
};
