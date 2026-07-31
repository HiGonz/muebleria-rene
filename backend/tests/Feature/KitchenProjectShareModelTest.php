<?php

namespace Tests\Feature;

use App\Models\KitchenProject;
use App\Models\KitchenProjectShare;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class KitchenProjectShareModelTest extends TestCase
{
    use RefreshDatabase;

    private function createProject(User $user): KitchenProject
    {
        return KitchenProject::create([
            'user_id' => $user->id,
            'client_name' => 'Cliente de prueba',
            'project_name' => 'Cocina de prueba',
            'room_width' => 400,
            'room_depth' => 300,
            'ceiling_height' => 240,
            'openings' => [],
        ]);
    }

    public function test_a_kitchen_project_can_have_shares(): void
    {
        $user = User::factory()->create();
        $project = $this->createProject($user);

        $share = $project->shares()->create(['token' => 'abc123']);

        $this->assertSame($share->id, $project->fresh()->activeShare->id);
        $this->assertSame($project->id, $share->kitchenProject->id);
    }

    public function test_is_active_is_false_once_revoked(): void
    {
        $share = new KitchenProjectShare(['revoked_at' => now()]);
        $this->assertFalse($share->isActive());
    }

    public function test_is_active_is_true_with_no_revocation_or_expiration(): void
    {
        $share = new KitchenProjectShare();
        $this->assertTrue($share->isActive());
    }

    public function test_active_share_ignores_revoked_shares(): void
    {
        $user = User::factory()->create();
        $project = $this->createProject($user);
        $project->shares()->create(['token' => 'revoked-one', 'revoked_at' => now()]);
        $active = $project->shares()->create(['token' => 'active-one']);

        $this->assertSame($active->id, $project->fresh()->activeShare->id);
    }

    public function test_active_share_ignores_expired_shares(): void
    {
        $user = User::factory()->create();
        $project = $this->createProject($user);
        $project->shares()->create(['token' => 'expired-one', 'expires_at' => now()->subHour()]);
        $active = $project->shares()->create(['token' => 'still-active']);

        $this->assertSame($active->id, $project->fresh()->activeShare->id);
    }
}
