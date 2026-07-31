<?php

namespace App\Http\Controllers;

use App\Models\Material;
use App\Models\Project;
use App\Models\Quote;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function index(): JsonResponse
    {
        $projects = Project::with('dimensions')->latest()->take(10)->get();
        $quotes = Quote::latest()->take(4)->get();
        $topMaterial = Material::orderByDesc('stock')->first();

        return response()->json([
            'activeProjects' => [
                'value' => Project::whereIn('status', ['Borrador', 'En diseño', 'Cotizado'])->count(),
                'change' => 0,
            ],
            'monthlyQuotes' => [
                'value' => Quote::whereMonth('created_at', now()->month)->count(),
                'change' => 0,
            ],
            'topMaterial' => [
                'value' => $topMaterial?->name ?? 'Sin datos',
                'quantity' => $topMaterial ? $topMaterial->stock.' en stock' : '',
                'change' => 0,
            ],
            'estimatedSales' => [
                'value' => (float) Quote::whereMonth('created_at', now()->month)->sum('total'),
                'change' => 0,
            ],
            'weeklyQuotes' => $quotes->map(fn (Quote $quote, int $index): array => [
                'week' => 'Sem '.($index + 1),
                'quotes' => 1,
            ]),
            'recentProjects' => $projects,
        ]);
    }
}
