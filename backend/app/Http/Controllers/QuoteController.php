<?php

namespace App\Http\Controllers;

use App\Models\Quote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QuoteController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Quote::with('project.dimensions')->latest()->get());
    }

    public function show(Quote $quote): JsonResponse
    {
        return response()->json($quote->load('project.materials', 'project.dimensions'));
    }

    public function updateStatus(Request $request, Quote $quote): JsonResponse
    {
        $quote->update($request->validate([
            'status' => ['required', 'in:Borrador,Enviada,Aprobada,Rechazada'],
        ]));

        return response()->json($quote);
    }
}
