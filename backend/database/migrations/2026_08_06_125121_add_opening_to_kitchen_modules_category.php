<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Adds 'opening' (decorative doors/windows) to kitchen_modules.category —
// the frontend started sending this category for puerta_decorativa/
// ventana_decorativa modules, but the column's enum never included it, so
// saving a project with one of these modules failed at the database layer
// (on top of the matching Rule::in() validation in
// KitchenProjectController, fixed alongside this).
//
// Postgres (production) implements enum() as an unnamed CHECK constraint —
// looked up by inspecting pg_constraint for whichever check constraint on
// this table actually mentions "category" rather than assuming Postgres's
// default auto-naming ({table}_{column}_check) applied, since that's a
// convention rather than a guarantee. SQLite (local/test) goes through
// Schema::table()->change() instead — SQLite has no ALTER-a-CHECK-
// constraint statement at all; Laravel's grammar handles it via a full
// table rebuild (verified locally: preserves every column/default/FK,
// despite `migrate --pretend` misleadingly logging an empty column list
// for this specific rebuild step).
return new class extends Migration
{
    private const OLD_VALUES = ['lower', 'upper', 'tower', 'corner', 'countertop', 'appliance', 'accessory'];
    private const NEW_VALUES = ['lower', 'upper', 'tower', 'corner', 'countertop', 'appliance', 'accessory', 'opening'];

    public function up(): void
    {
        $this->setCategoryCheck(self::NEW_VALUES);
    }

    public function down(): void
    {
        $this->setCategoryCheck(self::OLD_VALUES);
    }

    private function setCategoryCheck(array $values): void
    {
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            Schema::table('kitchen_modules', function (Blueprint $table) use ($values) {
                $table->enum('category', $values)->change();
            });
            return;
        }

        $constraint = DB::selectOne(<<<'SQL'
            SELECT con.conname
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            WHERE rel.relname = 'kitchen_modules'
              AND con.contype = 'c'
              AND pg_get_constraintdef(con.oid) LIKE '%category%'
        SQL);

        if ($constraint) {
            DB::statement('ALTER TABLE kitchen_modules DROP CONSTRAINT "' . $constraint->conname . '"');
        }

        $inList = "'" . implode("','", $values) . "'";
        DB::statement("ALTER TABLE kitchen_modules ADD CONSTRAINT kitchen_modules_category_check CHECK (category IN ({$inList}))");
    }
};
