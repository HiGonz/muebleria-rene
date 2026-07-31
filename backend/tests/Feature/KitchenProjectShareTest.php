<?php

namespace Tests\Feature;

use App\Models\KitchenProject;
use App\Models\KitchenProjectShare;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KitchenProjectShareTest extends TestCase
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

    public function test_creates_a_share_link_for_a_kitchen_project(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $project = $this->createProject($user);

        $response = $this->postJson("/api/kitchen-projects/{$project->id}/share");

        $response->assertStatus(200)
            ->assertJsonStructure(['token', 'url', 'viewCount', 'createdAt']);
        $this->assertDatabaseCount('kitchen_project_shares', 1);
    }

    public function test_reuses_the_existing_active_share_instead_of_creating_a_new_one(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $project = $this->createProject($user);

        $first = $this->postJson("/api/kitchen-projects/{$project->id}/share")->json();
        $second = $this->postJson("/api/kitchen-projects/{$project->id}/share")->json();

        $this->assertSame($first['token'], $second['token']);
        $this->assertDatabaseCount('kitchen_project_shares', 1);
    }

    public function test_a_user_cannot_share_another_users_kitchen_project(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $project = $this->createProject($owner);

        Sanctum::actingAs($intruder);

        $this->postJson("/api/kitchen-projects/{$project->id}/share")->assertStatus(403);
    }

    public function test_public_viewer_endpoint_returns_the_thin_project_payload(): void
    {
        $user = User::factory()->create();
        $project = $this->createProject($user);
        $project->modules()->create([
            'module_type' => 'cajonera',
            'category' => 'lower',
            'label' => 'Cajonera',
            'height' => 82,
            'width' => 60,
            'depth' => 60,
            'x' => 10,
            'z' => 10,
            'rotation' => 0,
            'options' => [],
        ]);
        $share = $project->shares()->create(['token' => 'test-token-123']);

        $response = $this->getJson('/api/public/kitchen-shares/test-token-123');

        $response->assertStatus(200)
            ->assertJson([
                'projectName' => 'Cocina de prueba',
                'roomWidth' => 400,
                'roomDepth' => 300,
                'ceilingHeight' => 240,
            ])
            ->assertJsonMissingPath('client_phone')
            ->assertJsonMissingPath('notes')
            ->assertJsonMissingPath('user_id')
            ->assertJsonMissingPath('status');
        $this->assertSame(1, $share->fresh()->view_count);
    }

    public function test_public_viewer_endpoint_404s_for_an_unknown_token(): void
    {
        $this->getJson('/api/public/kitchen-shares/does-not-exist')->assertStatus(404);
    }

    public function test_public_viewer_endpoint_404s_for_a_revoked_share(): void
    {
        $user = User::factory()->create();
        $project = $this->createProject($user);
        $project->shares()->create(['token' => 'revoked-token', 'revoked_at' => now()]);

        $this->getJson('/api/public/kitchen-shares/revoked-token')->assertStatus(404);
    }

    public function test_revoking_a_share_makes_it_inactive(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $project = $this->createProject($user);

        $this->postJson("/api/kitchen-projects/{$project->id}/share");
        $this->deleteJson("/api/kitchen-projects/{$project->id}/share")->assertStatus(200);

        $this->assertNotNull(KitchenProjectShare::first()->revoked_at);
    }

    public function test_revoking_when_no_active_share_exists_returns_404(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $project = $this->createProject($user);

        $this->deleteJson("/api/kitchen-projects/{$project->id}/share")->assertStatus(404);
    }
}
