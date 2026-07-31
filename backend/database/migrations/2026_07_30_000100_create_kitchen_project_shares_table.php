<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kitchen_project_shares', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kitchen_project_id')->constrained()->cascadeOnDelete();

            // Opaque, never the numeric kitchen_project_id — see PublicKitchenShareController.
            $table->string('token', 48)->unique();

            // Unused in Phase 1 — a form field + an `if` in
            // PublicKitchenShareController@show turns these on later without
            // a new migration.
            $table->string('password_hash')->nullable();
            $table->timestamp('expires_at')->nullable();

            // The "stop sharing" switch — set instead of deleting the row, so
            // "who was this shared with, when" survives even though there's
            // no UI for that history in Phase 1.
            $table->timestamp('revoked_at')->nullable();

            $table->unsignedInteger('view_count')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kitchen_project_shares');
    }
};
