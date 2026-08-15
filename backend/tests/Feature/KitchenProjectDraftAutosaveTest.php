<?php

namespace Tests\Feature;

use App\Models\KitchenProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KitchenProjectDraftAutosaveTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_a_kitchen_project_without_a_client_as_a_draft(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/kitchen-projects', [
            'project_name'   => 'Cocina sin cliente',
            'room_width'     => 400,
            'room_depth'     => 300,
            'ceiling_height' => 240,
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('client_name', null)
            ->assertJsonPath('autosave_enabled', true);

        $this->assertDatabaseHas('kitchen_projects', [
            'project_name' => 'Cocina sin cliente',
            'client_name'  => null,
        ]);
    }

    public function test_updates_client_name_from_null_to_a_value_and_back_to_null(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $project = KitchenProject::create([
            'user_id'        => $user->id,
            'project_name'   => 'Cocina de prueba',
            'room_width'     => 400,
            'room_depth'     => 300,
            'ceiling_height' => 240,
            'openings'       => [],
        ]);

        $this->assertNull($project->client_name);

        $this->putJson("/api/kitchen-projects/{$project->id}", ['client_name' => 'Ana Ruiz'])
            ->assertStatus(200)
            ->assertJsonPath('client_name', 'Ana Ruiz');

        $this->putJson("/api/kitchen-projects/{$project->id}", ['client_name' => null])
            ->assertStatus(200)
            ->assertJsonPath('client_name', null);
    }

    public function test_autosave_enabled_round_trips_through_create_and_update(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $created = $this->postJson('/api/kitchen-projects', [
            'project_name'     => 'Cocina autosave',
            'room_width'       => 400,
            'room_depth'       => 300,
            'ceiling_height'   => 240,
            'autosave_enabled' => false,
        ])->assertStatus(201)->json();

        $this->assertFalse($created['autosave_enabled']);

        $this->putJson("/api/kitchen-projects/{$created['id']}", ['autosave_enabled' => true])
            ->assertStatus(200)
            ->assertJsonPath('autosave_enabled', true);
    }
}
