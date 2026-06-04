<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── kitchen_projects ─────────────────────────────────────────────
        Schema::create('kitchen_projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Client info
            $table->string('client_name');
            $table->string('client_phone')->nullable();
            $table->string('project_name');
            $table->text('notes')->nullable();

            // Kitchen layout
            $table->enum('kitchen_style', [
                'Lineal', 'En L', 'En U', 'En G', 'Isla central', 'Dos paredes',
            ])->default('Lineal');
            $table->unsignedSmallInteger('wall_a_length')->default(300); // cm
            $table->unsignedSmallInteger('wall_b_length')->default(200); // cm
            $table->unsignedSmallInteger('wall_c_length')->default(200); // cm
            $table->unsignedSmallInteger('ceiling_height')->default(240); // cm

            // Status
            $table->enum('status', [
                'Borrador', 'En diseño', 'Cotizado', 'Aprobado', 'En producción', 'Entregado',
            ])->default('Borrador');

            $table->timestamps();
            $table->softDeletes();
        });

        // ── kitchen_modules ───────────────────────────────────────────────
        Schema::create('kitchen_modules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kitchen_project_id')->constrained()->cascadeOnDelete();

            // Identity
            $table->string('module_type');    // e.g. 'cajonera', 'bajo_tarja'
            $table->enum('category', [
                'lower', 'upper', 'tower', 'countertop', 'appliance', 'accessory',
            ]);
            $table->string('label');          // human-readable name
            $table->enum('wall', ['A', 'B', 'C', 'isla'])->default('A');
            $table->unsignedTinyInteger('position')->default(0); // order within wall

            // Dimensions (cm)
            $table->unsignedSmallInteger('height')->default(82);
            $table->unsignedSmallInteger('width')->default(60);
            $table->unsignedSmallInteger('depth')->default(60);

            // Options stored as JSON for flexibility
            $table->json('options');

            $table->timestamps();
        });

        // ── kitchen_quotes ────────────────────────────────────────────────
        Schema::create('kitchen_quotes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kitchen_project_id')->constrained()->cascadeOnDelete();
            $table->string('folio')->unique();
            $table->decimal('subtotal_materials', 12, 2)->default(0);
            $table->unsignedTinyInteger('labor_percentage')->default(30);
            $table->unsignedTinyInteger('profit_percentage')->default(20);
            $table->decimal('labor_cost', 12, 2)->default(0);
            $table->decimal('profit_cost', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            $table->json('material_lines');  // detailed line items
            $table->enum('status', ['Borrador', 'Enviada', 'Aprobada', 'Rechazada'])->default('Borrador');
            $table->date('valid_until')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kitchen_quotes');
        Schema::dropIfExists('kitchen_modules');
        Schema::dropIfExists('kitchen_projects');
    }
};
