<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\KitchenProjectController;
use App\Http\Controllers\MaterialController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\PublicKitchenShareController;
use App\Http\Controllers\QuoteController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

// Public — no auth:sanctum, serves the read-only client viewer. Kept in its
// own controller (never inside the group below) so it can never accidentally
// end up behind auth:sanctum.
Route::get('/public/kitchen-shares/{token}', [PublicKitchenShareController::class, 'show'])->middleware('throttle:60,1');

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    Route::get('/dashboard/stats', [DashboardController::class, 'index']);

    Route::apiResource('projects', ProjectController::class);
    Route::post('/projects/{project}/calculate', [ProjectController::class, 'calculate']);
    Route::post('/projects/{project}/quote', [ProjectController::class, 'quote']);

    Route::get('/quotes', [QuoteController::class, 'index']);
    Route::get('/quotes/{quote}', [QuoteController::class, 'show']);
    Route::put('/quotes/{quote}/status', [QuoteController::class, 'updateStatus']);

    Route::apiResource('materials', MaterialController::class)->except(['show']);

    // Kitchen projects (modular builder)
    Route::apiResource('kitchen-projects', KitchenProjectController::class);
    Route::post('/kitchen-projects/{kitchenProject}/modules/sync', [KitchenProjectController::class, 'syncModules']);
    Route::post('/kitchen-projects/{kitchenProject}/quote', [KitchenProjectController::class, 'quote']);
    Route::post('/kitchen-projects/{kitchenProject}/share', [KitchenProjectController::class, 'createShare']);
    Route::delete('/kitchen-projects/{kitchenProject}/share', [KitchenProjectController::class, 'revokeShare']);
});
