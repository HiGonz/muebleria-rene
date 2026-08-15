<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('kitchen_projects', function (Blueprint $table) {
            $table->string('client_name')->nullable()->change();
            $table->boolean('autosave_enabled')->default(true)->after('status');
        });

        // The placeholder was always a stand-in for "no client yet" — converting
        // existing rows to a real NULL is what makes old and new drafts behave
        // identically from here on (list badge, validation, etc.).
        DB::table('kitchen_projects')
            ->where('client_name', 'Cliente por asignar')
            ->update(['client_name' => null]);
    }

    public function down(): void
    {
        Schema::table('kitchen_projects', function (Blueprint $table) {
            $table->dropColumn('autosave_enabled');
            $table->string('client_name')->nullable(false)->change();
        });
    }
};
