<?php

namespace App\Http\Controllers;

use App\Models\KitchenProjectShare;
use Illuminate\Http\JsonResponse;

class PublicKitchenShareController extends Controller
{
    public function show(string $token): JsonResponse
    {
        $share = KitchenProjectShare::where('token', $token)->first();

        if (!$share || !$share->isActive()) {
            abort(404);
        }

        $share->increment('view_count');

        $project = $share->kitchenProject()->with('modules')->firstOrFail();

        return response()->json([
            'projectName' => $project->project_name,
            'roomWidth' => $project->room_width,
            'roomDepth' => $project->room_depth,
            'ceilingHeight' => $project->ceiling_height,
            'openings' => $project->openings,
            'modules' => $project->modules,
        ]);
    }
}
