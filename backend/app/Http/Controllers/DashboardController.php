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
            'activeProjects' => Project::whereIn('status', ['Borrador', 'En diseño', 'Cotizado'])->count(),
            'monthlyQuotes' => Quote::whereMonth('created_at', now()->month)->count(),
            'topMaterial' => $topMaterial?->name,
            'estimatedSales' => Quote::whereMonth('created_at', now()->month)->sum('total'),
            'weeklyQuotes' => $quotes->map(fn (Quote $quote, int $index): array => [
                'week' => 'Sem '.($index + 1),
                'quotes' => 1,
            ]),
            'recentProjects' => $projects,
        ]);
    }
}
