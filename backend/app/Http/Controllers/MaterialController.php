<?php

namespace App\Http\Controllers;

use App\Models\Material;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MaterialController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Material::query()->latest()->get());
    }

    public function store(Request $request): JsonResponse
    {
        $material = Material::create($request->validate([
            'name' => ['required', 'string'],
            'type' => ['required', 'string'],
            'unit' => ['required', 'string'],
            'cost_per_unit' => ['required', 'numeric'],
            'stock' => ['required', 'numeric'],
            'active' => ['required', 'boolean'],
        ]));

        return response()->json($material, 201);
    }

    public function update(Request $request, Material $material): JsonResponse
    {
        $material->update($request->validate([
            'name' => ['sometimes', 'string'],
            'type' => ['sometimes', 'string'],
            'unit' => ['sometimes', 'string'],
            'cost_per_unit' => ['sometimes', 'numeric'],
            'stock' => ['sometimes', 'numeric'],
            'active' => ['sometimes', 'boolean'],
        ]));

        return response()->json($material);
    }

    public function destroy(Material $material): JsonResponse
    {
        $material->delete();

        return response()->json([], 204);
    }
}
