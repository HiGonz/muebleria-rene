<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Quote;
use App\Services\MaterialCalculatorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectController extends Controller
{
    public function __construct(private readonly MaterialCalculatorService $calculator)
    {
    }

    public function index(): JsonResponse
    {
        return response()->json(Project::with(['dimensions', 'materials', 'quote'])->latest()->paginate());
    }

    public function store(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'client_name' => ['required', 'string'],
            'client_phone' => ['required', 'string'],
            'project_name' => ['required', 'string'],
            'furniture_type' => ['required', 'string'],
            'material' => ['required', 'string'],
            'color' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
            'status' => ['nullable', 'string'],
            'dimensions.height' => ['required', 'numeric'],
            'dimensions.width' => ['required', 'numeric'],
            'dimensions.depth' => ['required', 'numeric'],
            'dimensions.shelves' => ['nullable', 'integer'],
            'dimensions.drawers' => ['nullable', 'integer'],
            'dimensions.doors' => ['nullable', 'integer'],
        ]);

        $project = DB::transaction(function () use ($payload, $request) {
            $project = Project::create([
                ...collect($payload)->except('dimensions')->all(),
                'user_id' => $request->user()->id,
                'status' => $payload['status'] ?? 'Borrador',
            ]);

            $project->dimensions()->create($payload['dimensions']);

            return $project->load('dimensions');
        });

        return response()->json($project, 201);
    }

    public function show(Project $project): JsonResponse
    {
        return response()->json($project->load(['dimensions', 'materials.material', 'quote']));
    }

    public function update(Request $request, Project $project): JsonResponse
    {
        $payload = $request->validate([
            'client_name' => ['sometimes', 'string'],
            'client_phone' => ['sometimes', 'string'],
            'project_name' => ['sometimes', 'string'],
            'furniture_type' => ['sometimes', 'string'],
            'material' => ['sometimes', 'string'],
            'color' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
            'status' => ['sometimes', 'string'],
            'dimensions.height' => ['sometimes', 'numeric'],
            'dimensions.width' => ['sometimes', 'numeric'],
            'dimensions.depth' => ['sometimes', 'numeric'],
            'dimensions.shelves' => ['nullable', 'integer'],
            'dimensions.drawers' => ['nullable', 'integer'],
            'dimensions.doors' => ['nullable', 'integer'],
        ]);

        $project->update(collect($payload)->except('dimensions')->all());
        if (isset($payload['dimensions'])) {
            $project->dimensions()->updateOrCreate(['project_id' => $project->id], $payload['dimensions']);
        }

        return response()->json($project->fresh()->load('dimensions'));
    }

    public function destroy(Project $project): JsonResponse
    {
        $project->delete();

        return response()->json([], 204);
    }

    public function calculate(Project $project): JsonResponse
    {
        $dimensions = $project->dimensions;
        $items = $this->calculator->calculate([
            'type' => $project->furniture_type,
            'width' => $dimensions->width,
            'height' => $dimensions->height,
            'depth' => $dimensions->depth,
            'shelves' => $dimensions->shelves,
            'drawers' => $dimensions->drawers,
            'doors' => $dimensions->doors,
            'material' => $project->material,
        ]);

        return response()->json($items);
    }

    public function quote(Project $project): JsonResponse
    {
        $items = $this->calculate($project)->getData(true);
        $totals = $this->calculator->totals($items);

        $quote = Quote::updateOrCreate(
            ['project_id' => $project->id],
            [
                ...$totals,
                'status' => 'Borrador',
                'folio' => 'COT-'.now()->format('Y').'-'.str_pad((string) $project->id, 4, '0', STR_PAD_LEFT),
                'valid_until' => now()->addDays(15),
            ],
        );

        return response()->json($quote->load('project.dimensions'));
    }
}
