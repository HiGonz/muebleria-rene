<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('client_name');
            $table->string('client_phone');
            $table->string('project_name');
            $table->string('furniture_type');
            $table->string('material');
            $table->string('color')->nullable();
            $table->text('notes')->nullable();
            $table->string('status')->default('Borrador');
            $table->timestamps();
        });

        Schema::create('project_dimensions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->decimal('height', 8, 2);
            $table->decimal('width', 8, 2);
            $table->decimal('depth', 8, 2);
            $table->unsignedInteger('shelves')->default(0);
            $table->unsignedInteger('drawers')->default(0);
            $table->unsignedInteger('doors')->default(0);
            $table->timestamps();
        });

        Schema::create('materials', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('type');
            $table->string('unit');
            $table->decimal('cost_per_unit', 10, 2);
            $table->decimal('stock', 10, 2)->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('project_materials', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('material_id')->nullable()->constrained('materials')->nullOnDelete();
            $table->string('description');
            $table->decimal('quantity', 10, 2);
            $table->string('unit');
            $table->decimal('unit_cost', 10, 2);
            $table->decimal('subtotal', 12, 2);
            $table->timestamps();
        });

        Schema::create('quotes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->decimal('subtotal_materials', 12, 2);
            $table->decimal('labor_percentage', 5, 2)->default(30);
            $table->decimal('profit_percentage', 5, 2)->default(20);
            $table->decimal('labor_cost', 12, 2);
            $table->decimal('profit_cost', 12, 2);
            $table->decimal('total', 12, 2);
            $table->string('status')->default('Borrador');
            $table->string('folio')->unique();
            $table->date('valid_until')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quotes');
        Schema::dropIfExists('project_materials');
        Schema::dropIfExists('materials');
        Schema::dropIfExists('project_dimensions');
        Schema::dropIfExists('projects');
    }
};
