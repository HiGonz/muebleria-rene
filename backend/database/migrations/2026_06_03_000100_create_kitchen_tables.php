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

            // Kitchen layout — free rectangular room, modules placed freely inside it
            $table->unsignedSmallInteger('room_width')->default(400); // cm
            $table->unsignedSmallInteger('room_depth')->default(300); // cm
            $table->unsignedSmallInteger('ceiling_height')->default(240); // cm

            // Windows & doors on the perimeter walls
            $table->json('openings')->nullable();

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
                'lower', 'upper', 'tower', 'corner', 'countertop', 'appliance', 'accessory',
            ]);
            $table->string('label');          // human-readable name

            // Dimensions (cm)
            $table->unsignedSmallInteger('height')->default(82);
            $table->unsignedSmallInteger('width')->default(60);
            $table->unsignedSmallInteger('depth')->default(60);

            // Free placement in room space (cm) + rotation around Y (degrees)
            $table->integer('x')->default(0);
            $table->integer('z')->default(0);
            $table->unsignedSmallInteger('rotation')->default(0);

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
