<?php

namespace App\Http\Controllers;

use App\Models\KitchenProject;
use App\Models\KitchenModule;
use App\Models\KitchenProjectShare;
use App\Models\KitchenQuote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class KitchenProjectController extends Controller
{
    // ── List ──────────────────────────────────────────────────────────────────
    public function index(Request $request): JsonResponse
    {
        $projects = KitchenProject::where('user_id', $request->user()->id)
            ->withCount('modules')
            ->with('quote:id,kitchen_project_id,total,status,folio')
            ->latest()
            ->paginate(15);

        return response()->json($projects);
    }

    // ── Create ────────────────────────────────────────────────────────────────
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'client_name'    => 'required|string|max:120',
            'client_phone'   => 'nullable|string|max:30',
            'project_name'   => 'required|string|max:120',
            'notes'          => 'nullable|string|max:1000',
            'room_width'     => 'required|integer|min:100|max:2000',
            'room_depth'     => 'required|integer|min:100|max:2000',
            'ceiling_height' => 'required|integer|min:200|max:400',
            'openings'                 => 'nullable|array',
            'openings.*.id'            => 'required|string|max:60',
            'openings.*.type'          => ['required', Rule::in(['window', 'door'])],
            'openings.*.wall'          => ['required', Rule::in(['north', 'south', 'east', 'west'])],
            'openings.*.offset'        => 'required|numeric|min:0',
            'openings.*.width'         => 'required|numeric|min:0',
            'openings.*.height'        => 'required|numeric|min:0',
            'openings.*.sillHeight'    => 'required|numeric|min:0',
            'modules'        => 'nullable|array',
            'modules.*.module_type' => 'required|string|max:60',
            'modules.*.category'    => ['required', Rule::in(['lower', 'upper', 'tower', 'corner', 'countertop', 'appliance', 'accessory', 'opening'])],
            'modules.*.label'       => 'required|string|max:120',
            'modules.*.height'      => 'required|integer|min:1|max:500',
            'modules.*.width'       => 'required|integer|min:1|max:500',
            'modules.*.depth'       => 'required|integer|min:1|max:200',
            'modules.*.x'           => 'required|numeric',
            'modules.*.z'           => 'required|numeric',
            'modules.*.rotation'    => ['required', Rule::in([0, 90, 180, 270])],
            'modules.*.options'     => 'required|array',
        ]);

        $project = DB::transaction(function () use ($validated, $request) {
            $project = KitchenProject::create([
                'user_id'        => $request->user()->id,
                'client_name'    => $validated['client_name'],
                'client_phone'   => $validated['client_phone'] ?? null,
                'project_name'   => $validated['project_name'],
                'notes'          => $validated['notes'] ?? null,
                'room_width'     => $validated['room_width'],
                'room_depth'     => $validated['room_depth'],
                'ceiling_height' => $validated['ceiling_height'],
                'openings'       => $validated['openings'] ?? [],
            ]);

            foreach ($validated['modules'] ?? [] as $mod) {
                $project->modules()->create([
                    'module_type' => $mod['module_type'],
                    'category'    => $mod['category'],
                    'label'       => $mod['label'],
                    'height'      => $mod['height'],
                    'width'       => $mod['width'],
                    'depth'       => $mod['depth'],
                    'x'           => $mod['x'],
                    'z'           => $mod['z'],
                    'rotation'    => $mod['rotation'],
                    'options'     => $mod['options'],
                ]);
            }

            return $project;
        });

        return response()->json($project->load('modules'), 201);
    }

    // ── Show ──────────────────────────────────────────────────────────────────
    public function show(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $this->authorizeProject($request, $kitchenProject);
        return response()->json($kitchenProject->load('modules', 'quote'));
    }

    // ── Update ────────────────────────────────────────────────────────────────
    public function update(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $this->authorizeProject($request, $kitchenProject);

        $validated = $request->validate([
            'client_name'    => 'sometimes|string|max:120',
            'client_phone'   => 'nullable|string|max:30',
            'project_name'   => 'sometimes|string|max:120',
            'notes'          => 'nullable|string|max:1000',
            'room_width'     => 'sometimes|integer|min:100|max:2000',
            'room_depth'     => 'sometimes|integer|min:100|max:2000',
            'ceiling_height' => 'sometimes|integer|min:200|max:400',
            'openings'                 => 'nullable|array',
            'openings.*.id'            => 'required|string|max:60',
            'openings.*.type'          => ['required', Rule::in(['window', 'door'])],
            'openings.*.wall'          => ['required', Rule::in(['north', 'south', 'east', 'west'])],
            'openings.*.offset'        => 'required|numeric|min:0',
            'openings.*.width'         => 'required|numeric|min:0',
            'openings.*.height'        => 'required|numeric|min:0',
            'openings.*.sillHeight'    => 'required|numeric|min:0',
            'status'         => ['sometimes', Rule::in(['Borrador', 'En diseño', 'Cotizado', 'Aprobado', 'En producción', 'Entregado'])],
        ]);

        $kitchenProject->update($validated);

        return response()->json($kitchenProject->fresh('modules'));
    }

    // ── Destroy ───────────────────────────────────────────────────────────────
    public function destroy(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $this->authorizeProject($request, $kitchenProject);
        $kitchenProject->delete();
        return response()->json(['message' => 'Proyecto de cocina eliminado.']);
    }

    // ── Modules: sync (replace all) ───────────────────────────────────────────
    public function syncModules(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $this->authorizeProject($request, $kitchenProject);

        $validated = $request->validate([
            'modules'               => 'required|array',
            'modules.*.module_type' => 'required|string|max:60',
            'modules.*.category'    => ['required', Rule::in(['lower', 'upper', 'tower', 'corner', 'countertop', 'appliance', 'accessory', 'opening'])],
            'modules.*.label'       => 'required|string|max:120',
            'modules.*.height'      => 'required|integer|min:1|max:500',
            'modules.*.width'       => 'required|integer|min:1|max:500',
            'modules.*.depth'       => 'required|integer|min:1|max:200',
            'modules.*.x'           => 'required|numeric',
            'modules.*.z'           => 'required|numeric',
            'modules.*.rotation'    => ['required', Rule::in([0, 90, 180, 270])],
            'modules.*.options'     => 'required|array',
        ]);

        DB::transaction(function () use ($validated, $kitchenProject) {
            $kitchenProject->modules()->delete();
            foreach ($validated['modules'] as $mod) {
                $kitchenProject->modules()->create([
                    'module_type' => $mod['module_type'],
                    'category'    => $mod['category'],
                    'label'       => $mod['label'],
                    'height'      => $mod['height'],
                    'width'       => $mod['width'],
                    'depth'       => $mod['depth'],
                    'x'           => $mod['x'],
                    'z'           => $mod['z'],
                    'rotation'    => $mod['rotation'],
                    'options'     => $mod['options'],
                ]);
            }
        });

        return response()->json($kitchenProject->fresh('modules'));
    }

    // ── Quote ─────────────────────────────────────────────────────────────────
    public function quote(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $this->authorizeProject($request, $kitchenProject);

        $validated = $request->validate([
            'subtotal_materials' => 'required|numeric|min:0',
            'labor_percentage'   => 'required|integer|min:0|max:100',
            'profit_percentage'  => 'required|integer|min:0|max:100',
            'labor_cost'         => 'required|numeric|min:0',
            'profit_cost'        => 'required|numeric|min:0',
            'total'              => 'required|numeric|min:0',
            'material_lines'     => 'required|array',
            'valid_until'        => 'nullable|date|after:today',
        ]);

        $quote = $kitchenProject->quote()->updateOrCreate(
            ['kitchen_project_id' => $kitchenProject->id],
            array_merge($validated, [
                'folio' => $kitchenProject->quote?->folio ?? 'KIT-' . str_pad($kitchenProject->id, 5, '0', STR_PAD_LEFT),
            ])
        );

        $kitchenProject->update(['status' => 'Cotizado']);

        return response()->json($quote);
    }

    // ── Share ─────────────────────────────────────────────────────────────────
    public function createShare(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $this->authorizeProject($request, $kitchenProject);

        $share = $kitchenProject->activeShare()->first();

        if (!$share) {
            $share = $kitchenProject->shares()->create([
                'token' => Str::random(40),
            ]);
        }

        $origin = rtrim(explode(',', config('app.frontend_url'))[0], '/');

        return response()->json([
            'token' => $share->token,
            'url' => "{$origin}/viewer/{$share->token}",
            'viewCount' => $share->view_count,
            'createdAt' => $share->created_at,
        ]);
    }

    public function revokeShare(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $this->authorizeProject($request, $kitchenProject);

        $revoked = $kitchenProject->shares()->whereNull('revoked_at')->update(['revoked_at' => now()]);
        abort_if($revoked === 0, 404, 'Este proyecto no tiene un enlace activo.');

        return response()->json(['message' => 'Enlace de compartir revocado.']);
    }

    // ─────────────────────────────────────────────────────────────────────────
    private function authorizeProject(Request $request, KitchenProject $project): void
    {
        abort_if($project->user_id !== $request->user()->id, 403, 'No autorizado.');
    }
}
