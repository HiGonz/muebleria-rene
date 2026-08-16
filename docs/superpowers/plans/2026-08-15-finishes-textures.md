# Acabados/Texturas (Finishes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-managed, photo-driven finish/texture catalog (`finishes`) shared between exterior cabinet panels and countertops, replacing countertops' reuse of the cabinet wood-grain catalog, and let a finish add a per-m² surcharge to board pricing.

**Architecture:** New Laravel `finishes` table/model/controller with a synchronous upload pipeline (Intervention Image + native GD for a deterministic seamless-tile algorithm — no ML) storing to the existing `public` disk. Frontend: a new admin CRUD page mirroring the existing Materials CRUD, a unified `getFinishTexture()` that transparently serves the 4 existing procedural wood textures or an uploaded finish's photo through the same THREE.js texture cache, and targeted edits to the kitchen builder's countertop/panel pickers and pricing engine.

**Tech Stack:** Laravel 12 + Sanctum + `intervention/image` (new dependency) + native GD, PHPUnit/Sanctum feature tests; Next.js 16 + Zustand + Three.js, `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-08-15-finishes-textures-design.md`

## Global Constraints

- New backend table is `finishes`, fully independent of `materials` (per spec, confirmed by user).
- `type` enum is exactly `panel` | `cubierta` | `ambos`.
- The 4 procedural wood textures (`blanco_liso`, `roble_claro`, `nogal_oscuro`, `naranja_vibrante`) must keep rendering byte-identical to today — they stay hardcoded, not migrated into `finishes` rows.
- `extra_cost_per_m2` only affects pricing for `panel`/`ambos` finishes applied as an `exteriorTexture`; `cubierta`-typed finishes never affect price (countertop pricing stays on `COUNTERTOP_MODELS.pricePerM2`, untouched).
- Image processing is synchronous inside the request (no queue) — upload volume is low/admin-only.
- Storage uses the existing `public` disk (already configured, already works) — swapping to a Cloudflare-backed disk later is a config change, not a code change, and is explicitly out of scope until the user provides `.env` values.
- No AI/ML texture generation — the seamless-tile step is deterministic image processing only.
- Every existing kitchen project must keep rendering/pricing exactly as today if it never references a `finishes` row (`countertopModel.finishCode` unset → flat-color fallback already in place; unknown `exteriorTexture` id → falls back to `blanco_liso`).

---

## File Structure

**Backend (new):**
- `backend/database/migrations/2026_08_15_150000_create_finishes_table.php`
- `backend/app/Models/Finish.php`
- `backend/app/Services/FinishImageProcessor.php` — the seamless-tile algorithm, isolated so it's independently testable
- `backend/app/Http/Controllers/FinishController.php`
- `backend/tests/Feature/FinishControllerTest.php`
- `backend/tests/Unit/FinishImageProcessorTest.php`

**Backend (modified):**
- `backend/composer.json` — add `intervention/image`
- `backend/routes/api.php` — register `finishes` resource route

**Frontend (new):**
- `frontend/app/finishes/page.tsx`
- `frontend/components/finishes/FinishFormModal.tsx`

**Frontend (modified):**
- `frontend/services/http.ts` — add `postForm`
- `frontend/services/api.ts` — add `Finish` type + `listFinishes/createFinish/updateFinish/deleteFinish`
- `frontend/types/kitchen.ts` — widen `exteriorTexture`, remove `countertopTexture`
- `frontend/services/kitchenData.ts` — `CountertopModel.finishCode`, populate the 11 entries, board-pooling/pricing changes
- `frontend/components/3d/woodTextures.ts` — `getWoodTexture`/`getWoodRoughness` → `getFinishTexture`/`getFinishRoughness`
- `frontend/store/useKitchenStore.ts` — `finishes` state + `loadFinishes()`, `applyCountertopToAll` signature change
- `frontend/components/kitchen/ModuleInspector.tsx` — merge panel picker, remove countertop "Textura" section
- `frontend/components/3d/KitchenAssemblyScene.tsx` — `CountertopMesh` resolves texture from the model's `finishCode`
- `frontend/components/kitchen/KitchenBuilder.tsx` — call `loadFinishes()` on mount
- `frontend/components/layout/Sidebar.tsx` — add nav entry

---

### Task 1: Backend — `finishes` table + model

**Files:**
- Create: `backend/database/migrations/2026_08_15_150000_create_finishes_table.php`
- Create: `backend/app/Models/Finish.php`
- Test: `backend/tests/Unit/FinishModelTest.php`

**Interfaces:**
- Produces: `Finish` Eloquent model — `$fillable`: `name, code, type, source_image_url, texture_url, swatch_color, repeat_scale, roughness, extra_cost_per_m2, active`. Casts: `active:boolean`, `repeat_scale/roughness/extra_cost_per_m2:float`.

- [ ] **Step 1: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finishes', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code')->unique();
            $table->enum('type', ['panel', 'cubierta', 'ambos']);
            $table->string('source_image_url');
            $table->string('texture_url');
            $table->string('swatch_color');
            $table->float('repeat_scale')->default(2);
            $table->float('roughness')->default(0.5);
            $table->decimal('extra_cost_per_m2', 8, 2)->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('finishes');
    }
};
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && php artisan migrate`
Expected: `2026_08_15_150000_create_finishes_table ... DONE`

- [ ] **Step 3: Write the model**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Finish extends Model
{
    protected $fillable = [
        'name', 'code', 'type', 'source_image_url', 'texture_url',
        'swatch_color', 'repeat_scale', 'roughness', 'extra_cost_per_m2', 'active',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'repeat_scale' => 'float',
            'roughness' => 'float',
            'extra_cost_per_m2' => 'float',
        ];
    }
}
```

- [ ] **Step 4: Write the failing test**

```php
<?php

namespace Tests\Unit;

use App\Models\Finish;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinishModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_finish_can_be_created_with_defaults(): void
    {
        $finish = Finish::create([
            'name' => 'Roble Claro',
            'code' => 'roble_claro_foto',
            'type' => 'panel',
            'source_image_url' => 'https://example.test/orig.jpg',
            'texture_url' => 'https://example.test/texture.png',
            'swatch_color' => '#c8a06c',
        ]);

        $this->assertSame(2.0, $finish->repeat_scale);
        $this->assertSame(0.5, $finish->roughness);
        $this->assertSame(0.0, $finish->extra_cost_per_m2);
        $this->assertTrue($finish->active);
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=FinishModelTest`
Expected: `PASS`

- [ ] **Step 6: Commit**

```bash
git add backend/database/migrations/2026_08_15_150000_create_finishes_table.php backend/app/Models/Finish.php backend/tests/Unit/FinishModelTest.php
git commit -m "feat(backend): add finishes table and Finish model"
```

---

### Task 2: Backend — seamless-tile image processor

**Files:**
- Modify: `backend/composer.json` (add `intervention/image`)
- Create: `backend/app/Services/FinishImageProcessor.php`
- Test: `backend/tests/Unit/FinishImageProcessorTest.php`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `FinishImageProcessor::makeSeamlessTexture(UploadedFile $file): ImageInterface` (1024×1024, seamless at its outer edges), `FinishImageProcessor::sampleAverageColorHex(ImageInterface $image): string` (e.g. `"#a67c4a"`). Used by Task 3's controller.

- [ ] **Step 1: Install the dependency**

Run: `cd backend && composer require intervention/image`
Expected: adds `intervention/image` (^3.x) to `composer.json`/`composer.lock`.

- [ ] **Step 2: Write the failing tests**

```php
<?php

namespace Tests\Unit;

use App\Services\FinishImageProcessor;
use Illuminate\Http\UploadedFile;
use PHPUnit\Framework\TestCase;

class FinishImageProcessorTest extends TestCase
{
    public function test_output_is_always_1024_by_1024(): void
    {
        $file = new UploadedFile($this->makeTestImage(400, 250), 'sample.png', 'image/png', null, true);
        $result = (new FinishImageProcessor())->makeSeamlessTexture($file);

        $this->assertSame(1024, $result->width());
        $this->assertSame(1024, $result->height());
    }

    public function test_outer_edges_tile_without_a_hard_seam(): void
    {
        // A left-to-right gradient (plus noise) — after the 50% circular
        // shift the algorithm applies, opposite outer edges must come from
        // adjacent columns/rows of the ORIGINAL photo (see the comment on
        // FinishImageProcessor::offsetBlend), so their color should be
        // close even with no photo-specific tuning.
        $file = new UploadedFile($this->makeTestImage(512, 512), 'sample.png', 'image/png', null, true);
        $result = (new FinishImageProcessor())->makeSeamlessTexture($file);

        $gd = imagecreatefromstring((string) $result->toPng());
        foreach ([10, 500, 1000] as $y) {
            $left = imagecolorat($gd, 0, $y);
            $right = imagecolorat($gd, 1023, $y);
            $this->assertLessThan(40, abs((($left >> 16) & 0xFF) - (($right >> 16) & 0xFF)), "Left/right edge mismatch at y=$y");
        }
        imagedestroy($gd);
    }

    public function test_sample_average_color_hex_returns_a_hex_string(): void
    {
        $file = new UploadedFile($this->makeTestImage(200, 200), 'sample.png', 'image/png', null, true);
        $processor = new FinishImageProcessor();
        $result = $processor->makeSeamlessTexture($file);

        $hex = $processor->sampleAverageColorHex($result);

        $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $hex);
    }

    private function makeTestImage(int $w, int $h): string
    {
        $path = tempnam(sys_get_temp_dir(), 'finish_test_').'.png';
        $gd = imagecreatetruecolor($w, $h);
        for ($x = 0; $x < $w; $x++) {
            $shade = (int) (255 * $x / $w);
            for ($y = 0; $y < $h; $y++) {
                $v = max(0, min(255, $shade + random_int(-5, 5)));
                imagesetpixel($gd, $x, $y, imagecolorallocate($gd, $v, $v, $v));
            }
        }
        imagepng($gd, $path);
        imagedestroy($gd);

        return $path;
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=FinishImageProcessorTest`
Expected: FAIL with "Class FinishImageProcessor not found"

- [ ] **Step 4: Write the implementation**

```php
<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Intervention\Image\ImageManager;
use Intervention\Image\Interfaces\ImageInterface;

class FinishImageProcessor
{
    private const TEXTURE_SIZE = 1024;

    private readonly ImageManager $manager;

    public function __construct()
    {
        $this->manager = ImageManager::gd();
    }

    /**
     * Normalizes exposure, crops/resizes to a fixed square texture size,
     * then makes it tileable with a deterministic (no ML) offset+blend
     * pass — see offsetBlend() for how.
     */
    public function makeSeamlessTexture(UploadedFile $file): ImageInterface
    {
        $image = $this->manager->read($file->getRealPath());
        $image->cover(self::TEXTURE_SIZE, self::TEXTURE_SIZE);
        // Mild fixed contrast lift so unevenly-exposed phone photos read
        // more consistently once tiled — a real auto white-balance is
        // future work, not attempted here.
        $image->contrast(10);

        return $this->offsetBlend($image);
    }

    public function sampleAverageColorHex(ImageInterface $image): string
    {
        $tiny = clone $image;
        $tiny->resize(1, 1);
        $gd = imagecreatefromstring((string) $tiny->toPng());
        $rgb = imagecolorat($gd, 0, 0);
        imagedestroy($gd);

        return sprintf('#%02x%02x%02x', ($rgb >> 16) & 0xFF, ($rgb >> 8) & 0xFF, $rgb & 0xFF);
    }

    // Classic "make seamless" technique, done with native GD (a decades-
    // stable API) rather than guessed higher-level compositing calls:
    // circular-shift the (square, even-sized) image by half its width and
    // height. This swaps diagonal quadrants (TL<->BR, TR<->BL). The math:
    // new(x,y) = old((x+half) mod size, (y+half) mod size). Consequence —
    // new(0,y) reads old column `half`, new(size-1,y) reads old column
    // `half-1`: two ADJACENT columns of the original photo, which are
    // naturally continuous. So the shifted image's OUTER edges are already
    // seamless with zero blending. The only visible seam left is the
    // CENTER cross of the shifted image, where the photo's own (unrelated)
    // edges now sit next to each other — that's what featherCenterCross()
    // blends away.
    private function offsetBlend(ImageInterface $image): ImageInterface
    {
        $gd = imagecreatefromstring((string) $image->toPng());
        $size = imagesx($gd);
        $half = intdiv($size, 2);

        $wrapped = imagecreatetruecolor($size, $size);
        imagecopy($wrapped, $gd, 0, 0, $half, $half, $half, $half);
        imagecopy($wrapped, $gd, $half, 0, 0, $half, $half, $half);
        imagecopy($wrapped, $gd, 0, $half, $half, 0, $half, $half);
        imagecopy($wrapped, $gd, $half, $half, 0, 0, $half, $half);

        $this->featherCenterCross($wrapped, $size, $half);

        ob_start();
        imagepng($wrapped);
        $result = ob_get_clean();
        imagedestroy($gd);
        imagedestroy($wrapped);

        return $this->manager->read($result);
    }

    private function featherCenterCross($wrapped, int $size, int $half): void
    {
        $band = max(8, intdiv($size, 16));
        for ($x = 0; $x < $size; $x++) {
            for ($d = 0; $d < $band; $d++) {
                $this->blendTowardMirror($wrapped, $x, $half - 1 - $d, $x, $half + $d, 1 - ($d / $band));
            }
        }
        for ($y = 0; $y < $size; $y++) {
            for ($d = 0; $d < $band; $d++) {
                $this->blendTowardMirror($wrapped, $half - 1 - $d, $y, $half + $d, $y, 1 - ($d / $band));
            }
        }
    }

    // Pulls the pixel pair straddling the seam toward their mutual average
    // by $weight (1 = fully averaged right at the seam, fading to 0 at the
    // band's outer edge) so the blend tapers off instead of cutting sharply.
    private function blendTowardMirror($img, int $x1, int $y1, int $x2, int $y2, float $weight): void
    {
        $c1 = imagecolorat($img, $x1, $y1);
        $c2 = imagecolorat($img, $x2, $y2);
        $avg = $this->mix($c1, $c2, 0.5);
        imagesetpixel($img, $x1, $y1, imagecolorallocate($img, ...$this->mix($c1, $avg, $weight)));
        imagesetpixel($img, $x2, $y2, imagecolorallocate($img, ...$this->mix($c2, $avg, $weight)));
    }

    private function mix(int $colorA, int $colorB, float $weightB): array
    {
        $ar = ($colorA >> 16) & 0xFF; $ag = ($colorA >> 8) & 0xFF; $ab = $colorA & 0xFF;
        $br = ($colorB >> 16) & 0xFF; $bg = ($colorB >> 8) & 0xFF; $bb = $colorB & 0xFF;

        return [
            (int) round($ar * (1 - $weightB) + $br * $weightB),
            (int) round($ag * (1 - $weightB) + $bg * $weightB),
            (int) round($ab * (1 - $weightB) + $bb * $weightB),
        ];
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=FinishImageProcessorTest`
Expected: `PASS` (3 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/composer.json backend/composer.lock backend/app/Services/FinishImageProcessor.php backend/tests/Unit/FinishImageProcessorTest.php
git commit -m "feat(backend): add deterministic seamless-tile image processor"
```

---

### Task 3: Backend — `FinishController` + routes

**Files:**
- Create: `backend/app/Http/Controllers/FinishController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/FinishControllerTest.php`

**Interfaces:**
- Consumes: `Finish` model (Task 1), `FinishImageProcessor` (Task 2).
- Produces: `GET/POST /api/finishes`, `PUT/DELETE /api/finishes/{finish}` (auth:sanctum), JSON shape `{id, name, code, type, source_image_url, texture_url, swatch_color, repeat_scale, roughness, extra_cost_per_m2, active}` — consumed by Task 4's frontend client.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Models\Finish;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FinishControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function actingUser(): void
    {
        Sanctum::actingAs(User::factory()->create());
    }

    public function test_store_creates_a_finish_from_an_uploaded_photo(): void
    {
        $this->actingUser();

        $response = $this->post('/api/finishes', [
            'name' => 'Granito Negro Absoluto',
            'code' => 'granito_negro_absoluto',
            'type' => 'cubierta',
            'photo' => UploadedFile::fake()->image('granito.jpg', 400, 400),
            'repeat_scale' => 3,
            'roughness' => 0.6,
            'extra_cost_per_m2' => 0,
            'active' => true,
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('finishes', ['code' => 'granito_negro_absoluto', 'type' => 'cubierta']);
        $finish = Finish::where('code', 'granito_negro_absoluto')->firstOrFail();
        $this->assertNotEmpty($finish->texture_url);
        $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $finish->swatch_color);
    }

    public function test_store_fails_when_code_duplicates_an_existing_finish(): void
    {
        $this->actingUser();
        Finish::create([
            'name' => 'Existente', 'code' => 'dup', 'type' => 'panel',
            'source_image_url' => 'x', 'texture_url' => 'x', 'swatch_color' => '#ffffff',
        ]);

        $response = $this->post('/api/finishes', [
            'name' => 'Otro', 'code' => 'dup', 'type' => 'panel',
            'photo' => UploadedFile::fake()->image('a.jpg', 200, 200),
        ]);

        $response->assertStatus(422);
    }

    public function test_store_fails_with_an_invalid_type(): void
    {
        $this->actingUser();

        $response = $this->post('/api/finishes', [
            'name' => 'Malo', 'code' => 'malo', 'type' => 'no_existe',
            'photo' => UploadedFile::fake()->image('a.jpg', 200, 200),
        ]);

        $response->assertStatus(422);
    }

    public function test_update_without_a_new_photo_keeps_existing_texture_url(): void
    {
        $this->actingUser();
        $finish = Finish::create([
            'name' => 'Roble', 'code' => 'roble', 'type' => 'panel',
            'source_image_url' => 'https://example.test/original.png',
            'texture_url' => 'https://example.test/texture.png',
            'swatch_color' => '#a67c4a',
        ]);

        $response = $this->post("/api/finishes/{$finish->id}", [
            '_method' => 'PUT',
            'name' => 'Roble claro',
        ]);

        $response->assertStatus(200);
        $finish->refresh();
        $this->assertSame('Roble claro', $finish->name);
        $this->assertSame('https://example.test/texture.png', $finish->texture_url);
    }

    public function test_update_fails_when_changing_code_to_duplicate_another_finish(): void
    {
        $this->actingUser();
        Finish::create(['name' => 'A', 'code' => 'code_a', 'type' => 'panel', 'source_image_url' => 'x', 'texture_url' => 'x', 'swatch_color' => '#fff']);
        $b = Finish::create(['name' => 'B', 'code' => 'code_b', 'type' => 'panel', 'source_image_url' => 'x', 'texture_url' => 'x', 'swatch_color' => '#fff']);

        $response = $this->post("/api/finishes/{$b->id}", ['_method' => 'PUT', 'code' => 'code_a']);

        $response->assertStatus(422);
    }

    public function test_destroy_removes_the_finish(): void
    {
        $this->actingUser();
        $finish = Finish::create([
            'name' => 'Temp', 'code' => 'temp', 'type' => 'ambos',
            'source_image_url' => 'x', 'texture_url' => 'x', 'swatch_color' => '#000000',
        ]);

        $response = $this->delete("/api/finishes/{$finish->id}");

        $response->assertStatus(204);
        $this->assertDatabaseMissing('finishes', ['id' => $finish->id]);
    }

    public function test_requires_authentication(): void
    {
        $response = $this->getJson('/api/finishes');

        $response->assertStatus(401);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=FinishControllerTest`
Expected: FAIL (route/controller don't exist yet)

- [ ] **Step 3: Write the controller**

```php
<?php

namespace App\Http\Controllers;

use App\Models\Finish;
use App\Services\FinishImageProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class FinishController extends Controller
{
    public function __construct(private readonly FinishImageProcessor $imageProcessor) {}

    public function index(): JsonResponse
    {
        return response()->json(Finish::query()->latest()->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string'],
            'code' => ['required', 'string', 'max:255', 'unique:finishes,code'],
            'type' => ['required', Rule::in(['panel', 'cubierta', 'ambos'])],
            'photo' => ['required', 'image', 'max:10240'],
            'repeat_scale' => ['sometimes', 'numeric', 'min:0.1'],
            'roughness' => ['sometimes', 'numeric', 'min:0', 'max:1'],
            'extra_cost_per_m2' => ['sometimes', 'numeric', 'min:0'],
            'active' => ['sometimes', 'boolean'],
        ]);

        $urls = $this->storePhoto($request->file('photo'));

        $finish = Finish::create([
            'name' => $validated['name'],
            'code' => $validated['code'],
            'type' => $validated['type'],
            'source_image_url' => $urls['source'],
            'texture_url' => $urls['texture'],
            'swatch_color' => $urls['swatch'],
            'repeat_scale' => $validated['repeat_scale'] ?? 2,
            'roughness' => $validated['roughness'] ?? 0.5,
            'extra_cost_per_m2' => $validated['extra_cost_per_m2'] ?? 0,
            'active' => $validated['active'] ?? true,
        ]);

        return response()->json($finish, 201);
    }

    public function update(Request $request, Finish $finish): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string'],
            'code' => ['sometimes', 'string', 'max:255', Rule::unique('finishes', 'code')->ignore($finish->id)],
            'type' => ['sometimes', Rule::in(['panel', 'cubierta', 'ambos'])],
            'photo' => ['sometimes', 'image', 'max:10240'],
            'repeat_scale' => ['sometimes', 'numeric', 'min:0.1'],
            'roughness' => ['sometimes', 'numeric', 'min:0', 'max:1'],
            'extra_cost_per_m2' => ['sometimes', 'numeric', 'min:0'],
            'active' => ['sometimes', 'boolean'],
        ]);

        if ($request->hasFile('photo')) {
            $urls = $this->storePhoto($request->file('photo'));
            $validated['source_image_url'] = $urls['source'];
            $validated['texture_url'] = $urls['texture'];
            $validated['swatch_color'] = $urls['swatch'];
        }

        $finish->update($validated);

        return response()->json($finish->fresh());
    }

    public function destroy(Finish $finish): JsonResponse
    {
        $finish->delete();

        return response()->json([], 204);
    }

    /** @return array{source: string, texture: string, swatch: string} */
    private function storePhoto(UploadedFile $photo): array
    {
        $stem = (string) Str::uuid();
        $sourcePath = Storage::disk('public')->putFileAs('finishes', $photo, "{$stem}-original.{$photo->extension()}");

        $processed = $this->imageProcessor->makeSeamlessTexture($photo);
        $swatch = $this->imageProcessor->sampleAverageColorHex($processed);
        $texturePath = "finishes/{$stem}-texture.png";
        Storage::disk('public')->put($texturePath, (string) $processed->toPng());

        return [
            'source' => Storage::disk('public')->url($sourcePath),
            'texture' => Storage::disk('public')->url($texturePath),
            'swatch' => $swatch,
        ];
    }
}
```

- [ ] **Step 4: Register the route**

In `backend/routes/api.php`, add the import next to the other controller imports:

```php
use App\Http\Controllers\FinishController;
```

And inside the `Route::middleware('auth:sanctum')->group(...)` block, next to the `materials` line:

```php
Route::apiResource('finishes', FinishController::class)->except(['show']);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=FinishControllerTest`
Expected: `PASS` (7 tests)

- [ ] **Step 6: Run the full backend test suite to check for regressions**

Run: `cd backend && php artisan test`
Expected: all tests pass, including the pre-existing `MaterialControllerTest`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Http/Controllers/FinishController.php backend/routes/api.php backend/tests/Feature/FinishControllerTest.php
git commit -m "feat(backend): add FinishController CRUD with photo upload"
```

---

### Task 4: Frontend — API client

**Files:**
- Modify: `frontend/services/http.ts`
- Modify: `frontend/services/api.ts`

**Interfaces:**
- Consumes: `POST/GET/PUT/DELETE /api/finishes` (Task 3).
- Produces: `export interface Finish { id: number; name: string; code: string; type: "panel" | "cubierta" | "ambos"; sourceImageUrl: string; textureUrl: string; swatchColor: string; repeatScale: number; roughness: number; extraCostPerM2: number; active: boolean }`, `listFinishes(): Promise<Finish[]>`, `createFinish(input: FinishInput): Promise<Finish>`, `updateFinish(id: number, patch: Partial<FinishInput>): Promise<Finish>`, `deleteFinish(id: number): Promise<void>` — consumed by Task 6 (store) and Task 11 (admin page).

- [ ] **Step 1: Add the FormData-aware request helper**

In `frontend/services/http.ts`, add one line to the exported `http` object (the underlying `request()` function already skips JSON-encoding when `body instanceof FormData`, so this only needs a thin wrapper):

```typescript
export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  postForm: <T>(path: string, body: FormData) => request<T>(path, { method: "POST", body }),
};
```

- [ ] **Step 2: Add the Finish types and endpoints**

In `frontend/services/api.ts`, add near the existing `BackendMaterial` interface:

```typescript
interface BackendFinish {
  id: number;
  name: string;
  code: string;
  type: "panel" | "cubierta" | "ambos";
  source_image_url: string;
  texture_url: string;
  swatch_color: string;
  repeat_scale: number | string;
  roughness: number | string;
  extra_cost_per_m2: number | string;
  active: boolean;
}
```

And near the `// ─── Materials ───` section, add a new section:

```typescript
// ─── Finishes ────────────────────────────────────────────────────────────────
export interface Finish {
  id: number;
  name: string;
  code: string;
  type: "panel" | "cubierta" | "ambos";
  sourceImageUrl: string;
  textureUrl: string;
  swatchColor: string;
  repeatScale: number;
  roughness: number;
  extraCostPerM2: number;
  active: boolean;
}

function mapFinish(f: BackendFinish): Finish {
  return {
    id: f.id,
    name: f.name,
    code: f.code,
    type: f.type,
    sourceImageUrl: f.source_image_url,
    textureUrl: f.texture_url,
    swatchColor: f.swatch_color,
    repeatScale: Number(f.repeat_scale),
    roughness: Number(f.roughness),
    extraCostPerM2: Number(f.extra_cost_per_m2),
    active: f.active,
  };
}

export async function listFinishes(): Promise<Finish[]> {
  const finishes = await http.get<BackendFinish[]>("/finishes");
  return finishes.map(mapFinish);
}

export interface FinishInput {
  name: string;
  code: string;
  type: "panel" | "cubierta" | "ambos";
  photo?: File;
  repeatScale?: number;
  roughness?: number;
  extraCostPerM2?: number;
  active?: boolean;
}

function finishFormData(input: Partial<FinishInput>): FormData {
  const fd = new FormData();
  if (input.name !== undefined) fd.set("name", input.name);
  if (input.code !== undefined) fd.set("code", input.code);
  if (input.type !== undefined) fd.set("type", input.type);
  if (input.photo) fd.set("photo", input.photo);
  if (input.repeatScale !== undefined) fd.set("repeat_scale", String(input.repeatScale));
  if (input.roughness !== undefined) fd.set("roughness", String(input.roughness));
  if (input.extraCostPerM2 !== undefined) fd.set("extra_cost_per_m2", String(input.extraCostPerM2));
  if (input.active !== undefined) fd.set("active", input.active ? "1" : "0");
  return fd;
}

export async function createFinish(input: FinishInput): Promise<Finish> {
  const finish = await http.postForm<BackendFinish>("/finishes", finishFormData(input));
  return mapFinish(finish);
}

export async function updateFinish(id: number, patch: Partial<FinishInput>): Promise<Finish> {
  const fd = finishFormData(patch);
  fd.set("_method", "PUT");
  const finish = await http.postForm<BackendFinish>(`/finishes/${id}`, fd);
  return mapFinish(finish);
}

export async function deleteFinish(id: number): Promise<void> {
  await http.delete(`/finishes/${id}`);
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/services/http.ts frontend/services/api.ts
git commit -m "feat(frontend): add finishes API client"
```

---

### Task 5: Frontend — widen types, add `finishCode` to countertop models

**Files:**
- Modify: `frontend/types/kitchen.ts`
- Modify: `frontend/services/kitchenData.ts`

**Interfaces:**
- Produces: `KitchenModuleOptions.exteriorTexture: string` (was `ExteriorTextureId`), `countertopTexture` field removed, `CountertopModel.finishCode?: string`.

- [ ] **Step 1: Widen `exteriorTexture` and remove `countertopTexture`**

In `frontend/types/kitchen.ts`, find `exteriorTexture: ExteriorTextureId;` (around line 322) and change to:

```typescript
  exteriorTexture: string; // one of the 4 built-in ids in woodTextures.ts, or a finishes.code
```

Find and delete the line `countertopTexture?: ExteriorTextureId | "ninguna";` (around line 408) entirely.

`ExteriorTextureId` (line 158) stays as-is — it's still used internally by `woodTextures.ts` to type the built-in procedural catalog.

- [ ] **Step 2: Add `finishCode` to `CountertopModel` and populate the 11 entries**

In `frontend/services/kitchenData.ts`, update the interface (around line 233-239):

```typescript
export interface CountertopModel {
  id: string;
  label: string;
  material: CountertopMaterial;
  color: string;
  pricePerM2: number; // MXN
  finishCode?: string; // finishes.code of a photo-based texture; unset = flat `color` only
}
```

Add `finishCode` to each of the 11 entries, reusing the model's own `id` as the expected finish code (documents to whoever uploads photos later exactly what `code` to use):

```typescript
export const COUNTERTOP_MODELS: CountertopModel[] = [
  { id: "postformado_blanco", label: "Postformado Blanco", material: "Postformado", color: "#e8e4dc", pricePerM2: 420, finishCode: "postformado_blanco" },
  { id: "postformado_arena", label: "Postformado Arena", material: "Postformado", color: "#c8b89a", pricePerM2: 460, finishCode: "postformado_arena" },
  { id: "granito_negro_absoluto", label: "Granito Negro Absoluto", material: "Granito natural", color: "#1c1c1c", pricePerM2: 1900, finishCode: "granito_negro_absoluto" },
  { id: "granito_gris_mara", label: "Granito Gris Mara", material: "Granito natural", color: "#6b6b6b", pricePerM2: 1750, finishCode: "granito_gris_mara" },
  { id: "granito_blanco_dallas", label: "Granito Blanco Dallas", material: "Granito reconstituido", color: "#d8d2c4", pricePerM2: 1250, finishCode: "granito_blanco_dallas" },
  { id: "cuarzo_blanco_polar", label: "Cuarzo Blanco Polar", material: "Cuarzo engineered", color: "#f0ede6", pricePerM2: 2300, finishCode: "cuarzo_blanco_polar" },
  { id: "cuarzo_gris_urbano", label: "Cuarzo Gris Urbano", material: "Cuarzo engineered", color: "#9a9a94", pricePerM2: 2250, finishCode: "cuarzo_gris_urbano" },
  { id: "marmol_carrara", label: "Mármol Carrara", material: "Mármol", color: "#eeeae2", pricePerM2: 2600, finishCode: "marmol_carrara" },
  { id: "acero_inoxidable_satin", label: "Acero Inoxidable Satinado", material: "Acero inoxidable", color: "#b8bcbe", pricePerM2: 1650, finishCode: "acero_inoxidable_satin" },
  { id: "cemento_pulido_gris", label: "Cemento Pulido Gris", material: "Cemento pulido", color: "#918f8a", pricePerM2: 820, finishCode: "cemento_pulido_gris" },
  { id: "corian_blanco_hielo", label: "Corian Blanco Hielo", material: "Corian", color: "#f2ede2", pricePerM2: 1950, finishCode: "corian_blanco_hielo" },
];
```

(No `finishes` row exists yet for any of these codes — that's fine, the countertop render falls back to flat `color` until an admin uploads a photo with the matching `code`, per Task 9.)

- [ ] **Step 3: Type-check (expect errors — fixed by later tasks)**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors at every remaining `countertopTexture`/`applyCountertopToAll(...)` call site (`ModuleInspector.tsx`, `useKitchenStore.ts`, `KitchenAssemblyScene.tsx`) — these are fixed in Tasks 6-9. Do not try to fix them here; just confirm the errors are exactly the ones you expect (no unrelated breakage).

- [ ] **Step 4: Commit**

```bash
git add frontend/types/kitchen.ts frontend/services/kitchenData.ts
git commit -m "feat(frontend): widen exteriorTexture type, add finishCode to countertop models"
```

---

### Task 6: Frontend — `finishes` store state

**Files:**
- Modify: `frontend/store/useKitchenStore.ts`

**Interfaces:**
- Consumes: `listFinishes()`, `type Finish` (Task 4).
- Produces: `useKitchenStore().finishes: Finish[]`, `useKitchenStore().loadFinishes(): Promise<void>`, `applyCountertopToAll(modelId: string, color: string): number` (texture param removed — texture now comes from the model's own `finishCode`, see Task 9).

- [ ] **Step 1: Add `finishes` state and `loadFinishes`**

In `frontend/store/useKitchenStore.ts`, add the import:

```typescript
import { listMaterials, listFinishes, type Finish } from "@/services/api";
```

(Adjust to merge with whatever the existing `listMaterials` import line already looks like — add `listFinishes, type Finish` to it rather than a second import line.)

Add to the store interface, near `materialCosts`:

```typescript
  finishes: Finish[];
```

And near `loadMaterialCosts: () => Promise<void>;`:

```typescript
  loadFinishes: () => Promise<void>;
```

In the store's initial state (near `materialCosts: null,`):

```typescript
      finishes: [],
```

Add the action, right after `loadMaterialCosts`'s implementation:

```typescript
      loadFinishes: async () => {
        try {
          const finishes = await listFinishes();
          set({ finishes: finishes.filter((f) => f.active) });
        } catch {
          // Network/API failure — leave finishes as [] (or whatever was
          // last loaded); panel/countertop texture lookups keep working
          // off the 4 built-in procedural ids either way.
        }
      },
```

- [ ] **Step 2: Update `applyCountertopToAll`'s signature**

Find `applyCountertopToAll: (modelId, color, texture) => {` and the interface line `applyCountertopToAll: (modelId: string, color: string, texture: ExteriorTextureId | "ninguna") => number;` — change both to drop the third parameter:

```typescript
  applyCountertopToAll: (modelId: string, color: string) => number;
```

```typescript
      applyCountertopToAll: (modelId, color) => {
        const model = getCountertopModel(modelId);
        const hasCountertop = (m: KitchenModule) => m.category === "countertop" || m.options.includesCountertop;
        const affected = get().draft.modules.filter(hasCountertop).length;
        set((s) => ({
          draft: {
            ...s.draft,
            modules: s.draft.modules.map((m) =>
              hasCountertop(m)
                ? {
                    ...m,
                    options: {
                      ...m.options,
                      countertopModel: modelId,
                      countertopMaterial: model?.material ?? m.options.countertopMaterial,
                      countertopColor: color,
                    },
                  }
                : m
            ),
          },
        }));
        return affected;
      },
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors only in `ModuleInspector.tsx` (still calling the 3-arg `applyCountertopToAll` and referencing `countertopTexture`) — fixed in Task 8.

- [ ] **Step 4: Commit**

```bash
git add frontend/store/useKitchenStore.ts
git commit -m "feat(frontend): add finishes catalog to kitchen store"
```

---

### Task 7: Frontend — unified `getFinishTexture`

**Files:**
- Modify: `frontend/components/3d/woodTextures.ts`

**Interfaces:**
- Consumes: `useKitchenStore().finishes` (Task 6).
- Produces: `getFinishTexture(id: string | undefined): THREE.Texture | null` (replaces `getWoodTexture`), `getFinishRoughness(id: string | undefined): number` (replaces `getWoodRoughness`). `WOOD_TEXTURES` keeps its existing exported shape (`{id, label, swatch}[]`), just with `id: string` instead of `id: ExteriorTextureId`.

- [ ] **Step 1: Rewrite the file**

```typescript
import * as THREE from "three";
import { useKitchenStore } from "@/store/useKitchenStore";

// Small hand-picked built-in catalog, procedurally-painted (canvas-generated,
// no image assets) — kept exactly as before. Uploaded finishes (see
// useKitchenStore's `finishes`) extend this same id/code namespace; see
// getFinishTexture below for how the two are resolved through one function.
export interface WoodTextureDef {
  id: string;
  label: string;
  swatch: string;
}

export const WOOD_TEXTURES: WoodTextureDef[] = [
  { id: "blanco_liso", label: "Blanco liso", swatch: "#f5f2ea" },
  { id: "roble_claro", label: "Roble claro", swatch: "#c8a06c" },
  { id: "nogal_oscuro", label: "Nogal oscuro", swatch: "#5a3a24" },
  { id: "naranja_vibrante", label: "Naranja vibrante", swatch: "#d4761f" },
];

interface GrainParams {
  base: string;
  grain: string;
  stripes: number;
  roughness: number;
}

const GRAIN_PARAMS: Record<string, GrainParams> = {
  blanco_liso: { base: "#f7f5f0", grain: "#e6e2d6", stripes: 0, roughness: 0.32 },
  roble_claro: { base: "#caa06e", grain: "#a67c4a", stripes: 16, roughness: 0.55 },
  nogal_oscuro: { base: "#5c3c26", grain: "#3a2515", stripes: 20, roughness: 0.48 },
  naranja_vibrante: { base: "#d97a22", grain: "#af5f13", stripes: 14, roughness: 0.5 },
};

function paintGrain(ctx: CanvasRenderingContext2D, w: number, h: number, p: GrainParams) {
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, w, h);
  if (p.stripes <= 0) return;

  const bandW = w / p.stripes;
  for (let i = 0; i < p.stripes; i++) {
    const cx = i * bandW + bandW / 2;
    ctx.strokeStyle = p.grain;
    ctx.globalAlpha = 0.22 + Math.random() * 0.22;
    ctx.lineWidth = bandW * (0.15 + Math.random() * 0.25);
    ctx.beginPath();
    let x = cx + (Math.random() - 0.5) * bandW * 0.3;
    ctx.moveTo(x, 0);
    const segments = 6;
    for (let s = 1; s <= segments; s++) {
      const y = (h / segments) * s;
      x += (Math.random() - 0.5) * bandW * 0.4;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < p.stripes * 2; i++) {
    ctx.strokeStyle = p.grain;
    ctx.globalAlpha = 0.06 + Math.random() * 0.08;
    ctx.lineWidth = 1;
    const x = Math.random() * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 20, h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const textureCache = new Map<string, THREE.Texture>();

// Resolves any exteriorTexture/finishCode id to a usable THREE.Texture: the
// 4 built-in ids keep painting a canvas exactly as before (zero visual
// regression). Anything else is looked up against the admin-uploaded
// finishes catalog (useKitchenStore's `finishes`, loaded via loadFinishes())
// and loaded from its texture_url. Falls back to blanco_liso if the id
// matches neither — covers a project referencing a finish that was later
// deleted/deactivated.
export function getFinishTexture(id: string | undefined): THREE.Texture | null {
  if (typeof document === "undefined") return null; // SSR guard, never actually hit (3D tree is client-only)
  const key = id ?? "blanco_liso";
  const cached = textureCache.get(key);
  if (cached) return cached;

  const builtIn = GRAIN_PARAMS[key];
  if (builtIn) {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    paintGrain(ctx, size, size, builtIn);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(key, texture);
    return texture;
  }

  const finish = useKitchenStore.getState().finishes.find((f) => f.code === key);
  if (!finish) return key === "blanco_liso" ? null : getFinishTexture("blanco_liso");

  const texture = new THREE.TextureLoader().load(finish.textureUrl);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(finish.repeatScale, finish.repeatScale);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

export function getFinishRoughness(id: string | undefined): number {
  const key = id ?? "blanco_liso";
  const builtIn = GRAIN_PARAMS[key];
  if (builtIn) return builtIn.roughness;

  const finish = useKitchenStore.getState().finishes.find((f) => f.code === key);
  return finish?.roughness ?? GRAIN_PARAMS.blanco_liso.roughness;
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors in `KitchenAssemblyScene.tsx` (still importing `getWoodTexture`/`getWoodRoughness`) — fixed in Task 9.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/3d/woodTextures.ts
git commit -m "feat(frontend): unify built-in and uploaded textures behind getFinishTexture"
```

---

### Task 8: Frontend — `ModuleInspector.tsx` panel picker + countertop section

**Files:**
- Modify: `frontend/components/kitchen/ModuleInspector.tsx`

**Interfaces:**
- Consumes: `useKitchenStore().finishes` (Task 6), `applyCountertopToAll(modelId, color)` (Task 6).

- [ ] **Step 1: Merge the exterior panel `TexturePicker`**

Find the `TexturePicker` component (around line 166-185) and change it to also render finishes of type `panel`/`ambos`:

```typescript
function TexturePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const finishes = useKitchenStore((s) => s.finishes).filter((f) => f.type === "panel" || f.type === "ambos");
  const options: { id: string; label: string; swatch: string }[] = [
    ...WOOD_TEXTURES,
    ...finishes.map((f) => ({ id: f.code, label: f.name, swatch: f.swatchColor })),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          title={t.label}
          className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors ${
            value === t.id ? "border-brass bg-brass/10" : "border-ivory/10 bg-ivory/3 hover:border-ivory/25"
          }`}
        >
          <span className="h-8 w-12 rounded-md border border-black/20" style={{ backgroundColor: t.swatch }} />
          <span className="text-[10px] text-warmgray">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
```

(`useKitchenStore` is already imported at the top of this file per the existing `applyExteriorToAll, applyExteriorToBand, ...` destructure — no new import needed.)

- [ ] **Step 2: Remove the countertop "Textura" section and update its callers**

Find `applyCountertopToAll(model.id, model.color, opt.countertopTexture ?? "ninguna");` (around line 965) and change to:

```typescript
                    applyCountertopToAll(model.id, model.color);
```

Find the two `onChange` handlers for the color input/swatch (around lines 975 and 980), each currently `applyCountertopToAll(opt.countertopModel ?? "", e.target.value, opt.countertopTexture ?? "ninguna")` — change both to:

```typescript
                    onChange={(e) => applyCountertopToAll(opt.countertopModel ?? "", e.target.value)}
```

Delete the entire `<FieldGroup label="Textura">...</FieldGroup>` block for countertops (around lines 986-1014 — the one with the "Ninguna (color liso)" button and the `WOOD_TEXTURES.map` chips for countertops) — this is the section the original request asked to remove.

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no more `countertopTexture` or `applyCountertopToAll(...)` arity errors. Any remaining errors should only be in `KitchenAssemblyScene.tsx` (Task 9).

- [ ] **Step 4: Commit**

```bash
git add frontend/components/kitchen/ModuleInspector.tsx
git commit -m "feat(frontend): merge uploaded finishes into panel picker, drop countertop Textura"
```

---

### Task 9: Frontend — `CountertopMesh` uses the model's `finishCode`

**Files:**
- Modify: `frontend/components/3d/KitchenAssemblyScene.tsx`

**Interfaces:**
- Consumes: `getFinishTexture`, `getFinishRoughness` (Task 7), `CountertopModel.finishCode` (Task 5).

- [ ] **Step 1: Update the import**

Find `import { getWoodTexture, getWoodRoughness } from "./woodTextures";` (around line 13) and change to:

```typescript
import { getFinishTexture, getFinishRoughness } from "./woodTextures";
```

- [ ] **Step 2: Update `CountertopMesh`'s texture resolution**

Find (around lines 763-772):

```typescript
  const ctColor = mod.options.countertopColor || ctColorMap[mod.options.countertopMaterial] || "#c8b89a";
  const ctTextureId = mod.options.countertopTexture !== "ninguna" ? mod.options.countertopTexture : undefined;
  const ctMap = ctTextureId ? getWoodTexture(ctTextureId) : null;
```

Replace with:

```typescript
  const ctColor = mod.options.countertopColor || ctColorMap[mod.options.countertopMaterial] || "#c8b89a";
  const ctModel = getCountertopModel(mod.options.countertopModel);
  const ctMap = ctModel?.finishCode ? getFinishTexture(ctModel.finishCode) : null;
```

(`getCountertopModel` is already imported from `@/services/kitchenData` at the top of this file per the existing import list — confirm it's there; if not, add it to that import.)

Find the body/exterior-panel texture lines just below (originally around 771-772):

```typescript
  const bodyMap = getWoodTexture(mod.options.exteriorTexture);
  const bodyRoughness = getWoodRoughness(mod.options.exteriorTexture);
```

Replace with:

```typescript
  const bodyMap = getFinishTexture(mod.options.exteriorTexture);
  const bodyRoughness = getFinishRoughness(mod.options.exteriorTexture);
```

- [ ] **Step 3: Search the file for any other `getWoodTexture`/`getWoodRoughness` call sites**

Run: `cd frontend && grep -n "getWoodTexture\|getWoodRoughness" components/3d/KitchenAssemblyScene.tsx`
Expected: no matches. If any remain (e.g. in `CabinetMesh` for door/panel rendering), rename them the same way (`getWoodTexture` → `getFinishTexture`, `getWoodRoughness` → `getFinishRoughness`) — the call arguments don't change, only the function name.

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Manual verification**

Start the frontend dev server, open an existing kitchen project with a countertop, and confirm it still renders with its flat color (no `finishes` rows exist yet, so `ctMap` is `null` — this must look identical to before this task). Then open a cabinet's exterior panel picker and confirm the 4 built-in wood textures still render and apply correctly.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/3d/KitchenAssemblyScene.tsx
git commit -m "feat(frontend): countertop texture now resolves from its model's finishCode"
```

---

### Task 10: Frontend — pricing surcharge + board pooling by finish

**Files:**
- Modify: `frontend/services/kitchenData.ts`

**Interfaces:**
- Consumes: `Finish[]` (Task 4's type), passed in from the store.
- Produces: `calculateKitchenMaterials(modules, materialCosts, finishes)` — new 3rd parameter, `finishes?: Finish[] | null`.

- [ ] **Step 1: Add the `finishes` parameter and build a cost lookup**

Find the function signature (around line 1675):

```typescript
export function calculateKitchenMaterials(modules: KitchenModule[], materialCosts?: Map<string, number> | null): { lines: KitchenMaterialLine[]; summary: KitchenQuoteSummary } {
```

Change to:

```typescript
export function calculateKitchenMaterials(modules: KitchenModule[], materialCosts?: Map<string, number> | null, finishes?: Finish[] | null): { lines: KitchenMaterialLine[]; summary: KitchenQuoteSummary } {
  // Only panel/ambos finishes affect board pricing — cubierta-typed
  // finishes are purely visual (countertop pricing lives entirely on
  // COUNTERTOP_MODELS.pricePerM2).
  const finishSurchargeByCode = new Map<string, number>(
    (finishes ?? [])
      .filter((f) => (f.type === "panel" || f.type === "ambos") && f.extraCostPerM2 > 0)
      .map((f) => [f.code, f.extraCostPerM2])
  );
```

(Add `import type { Finish } from "./api";` at the top of `kitchenData.ts` if it doesn't already import from `./api` — check first; if `services/api.ts` already imports FROM `kitchenData.ts`, importing back would be circular, so instead declare a minimal local type in `kitchenData.ts` — see Step 1a below.)

- [ ] **Step 1a: Avoid a circular import**

Run: `cd frontend && grep -n "from \"./kitchenData\"\|from '@/services/kitchenData'" services/api.ts`
If this prints any matches, `api.ts` imports from `kitchenData.ts`, so `kitchenData.ts` must NOT import `Finish` back from `api.ts`. In that case, replace the `finishes?: Finish[] | null` parameter type with a minimal local shape instead of importing `Finish`:

```typescript
export function calculateKitchenMaterials(
  modules: KitchenModule[],
  materialCosts?: Map<string, number> | null,
  finishes?: { code: string; type: "panel" | "cubierta" | "ambos"; extraCostPerM2: number }[] | null
): { lines: KitchenMaterialLine[]; summary: KitchenQuoteSummary } {
```

(This is a structural-typing-compatible subset of `Finish` — the store can still pass its real `Finish[]` array through unchanged.)

- [ ] **Step 2: Change board pooling to key by (material, exteriorTexture) for the Exterior pool**

Find (around lines 1790-1817):

```typescript
  const interiorPieces = new Map<BoardMaterial, CutPiece[]>();
  const exteriorPieces = new Map<BoardMaterial, CutPiece[]>();
  const boardPools = { Interior: interiorPieces, Exterior: exteriorPieces } as const;
  const partPieces = new Map<string, { pool: keyof typeof boardPools; material: BoardMaterial; part: string; width: number; height: number; count: number }>();
  let currentModuleId = "";
  let currentModuleLabel = "";
  const addPiece = (poolLabel: keyof typeof boardPools, material: BoardMaterial, width: number, height: number, part: string) => {
    if (width <= 0 || height <= 0) return;
    const pool = boardPools[poolLabel];
    const list = pool.get(material) ?? [];
    list.push({ width, height, label: part, moduleId: currentModuleId, moduleLabel: currentModuleLabel });
    pool.set(material, list);

    // Round to 1mm so near-identical floating point sizes (e.g. from percentage
    // splits) still group into the same cut-size bucket.
    const w = Math.round(width * 10) / 10;
    const h = Math.round(height * 10) / 10;
    const key = `${poolLabel}|${material}|${part}|${w}x${h}`;
    const agg = partPieces.get(key) ?? { pool: poolLabel, material, part, width: w, height: h, count: 0 };
    agg.count += 1;
    partPieces.set(key, agg);
  };
```

Replace with:

```typescript
  // Interior board never varies by finish (it's a fixed shop-standard
  // board, not configurable per module — see the "Tablero interior" info
  // box in ModuleInspector.tsx). Exterior board DOES vary by finish now
  // that a finish can carry its own price — so pool it by (material,
  // exteriorTexture) instead of material alone, or two panels of the same
  // board but differently-priced finishes would incorrectly merge into
  // one sheet-cost line.
  const interiorPieces = new Map<string, CutPiece[]>();
  const exteriorPieces = new Map<string, CutPiece[]>();
  const boardPools = { Interior: interiorPieces, Exterior: exteriorPieces } as const;
  const partPieces = new Map<string, { pool: keyof typeof boardPools; material: BoardMaterial; textureCode: string; part: string; width: number; height: number; count: number }>();
  let currentModuleId = "";
  let currentModuleLabel = "";
  let currentModuleExteriorTexture = "";
  const poolKey = (material: BoardMaterial, textureCode: string) => `${material}::${textureCode}`;
  const addPiece = (poolLabel: keyof typeof boardPools, material: BoardMaterial, width: number, height: number, part: string) => {
    if (width <= 0 || height <= 0) return;
    const textureCode = poolLabel === "Exterior" ? currentModuleExteriorTexture : "";
    const key = poolKey(material, textureCode);
    const pool = boardPools[poolLabel];
    const list = pool.get(key) ?? [];
    list.push({ width, height, label: part, moduleId: currentModuleId, moduleLabel: currentModuleLabel });
    pool.set(key, list);

    const w = Math.round(width * 10) / 10;
    const h = Math.round(height * 10) / 10;
    const partKey = `${poolLabel}|${key}|${part}|${w}x${h}`;
    const agg = partPieces.get(partKey) ?? { pool: poolLabel, material, textureCode, part, width: w, height: h, count: 0 };
    agg.count += 1;
    partPieces.set(partKey, agg);
  };
```

- [ ] **Step 3: Set `currentModuleExteriorTexture` per module**

Find (around lines 1825-1828):

```typescript
  for (const mod of modules) {
    currentModuleId = mod.id;
    currentModuleLabel = mod.label;
    const { dimensions: d, options: o } = mod;
```

Replace with:

```typescript
  for (const mod of modules) {
    currentModuleId = mod.id;
    currentModuleLabel = mod.label;
    const { dimensions: d, options: o } = mod;
    currentModuleExteriorTexture = o.exteriorTexture ?? "";
```

- [ ] **Step 4: Update the resolve loop to split the composite key and add the surcharge**

Find (around lines 2405-2414):

```typescript
  for (const poolLabel of Object.keys(boardPools) as (keyof typeof boardPools)[]) {
    for (const [material, pieces] of boardPools[poolLabel]) {
      const boardCost = materialCosts?.get(material) ?? BOARD_COSTS[material] ?? 180;
      const sheetCost = boardCost * sheetAreaM2;
      const result = packSheets(pieces);
      const netAreaM2 = result.usedAreaCm2 / 10000;
      const utilization = Math.round(result.utilizationPct);
      const waste = 100 - utilization;
      const cutDetails = Array.from(partPieces.values())
        .filter((p) => p.pool === poolLabel && p.material === material)
```

Replace with:

```typescript
  for (const poolLabel of Object.keys(boardPools) as (keyof typeof boardPools)[]) {
    for (const [key, pieces] of boardPools[poolLabel]) {
      const [material, textureCode] = key.split("::") as [BoardMaterial, string];
      const boardCost = materialCosts?.get(material) ?? BOARD_COSTS[material] ?? 180;
      const finishSurcharge = finishSurchargeByCode.get(textureCode) ?? 0;
      const sheetCost = (boardCost + finishSurcharge) * sheetAreaM2;
      const result = packSheets(pieces);
      const netAreaM2 = result.usedAreaCm2 / 10000;
      const utilization = Math.round(result.utilizationPct);
      const waste = 100 - utilization;
      const cutDetails = Array.from(partPieces.values())
        .filter((p) => p.pool === poolLabel && p.material === material && p.textureCode === textureCode)
```

- [ ] **Step 5: Update the store's `getMaterials` getter to pass `finishes` through**

In `frontend/store/useKitchenStore.ts`, find:

```typescript
      getMaterials: () => calculateKitchenMaterials(get().draft.modules, get().materialCosts),
```

Replace with:

```typescript
      getMaterials: () => calculateKitchenMaterials(get().draft.modules, get().materialCosts, get().finishes),
```

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 7: Manual verification**

Open the kitchen builder with an existing project that has several exterior-board modules, note the current sheet cost total in the Resumen tab, confirm it's unchanged (no `finishes` rows exist yet, so `finishSurcharge` is always 0 — this task must be a no-op on every existing project's quote). Then (once Task 11 is done and a finish with a nonzero `extra_cost_per_m2` exists) re-check that applying it to a panel raises the quoted board cost by exactly `extra_cost_per_m2 * sheetAreaM2` per sheet.

- [ ] **Step 8: Commit**

```bash
git add frontend/services/kitchenData.ts frontend/store/useKitchenStore.ts
git commit -m "feat(frontend): finish surcharge affects board sheet pricing"
```

---

### Task 11: Frontend — Admin CRUD page

**Files:**
- Create: `frontend/app/finishes/page.tsx`
- Create: `frontend/components/finishes/FinishFormModal.tsx`
- Modify: `frontend/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `listFinishes/createFinish/updateFinish/deleteFinish` (Task 4).

- [ ] **Step 1: Write the form modal**

```typescript
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createFinish, updateFinish, type Finish, type FinishInput } from "@/services/api";

const TYPE_OPTIONS: { value: FinishInput["type"]; label: string }[] = [
  { value: "panel", label: "Panel exterior" },
  { value: "cubierta", label: "Cubierta" },
  { value: "ambos", label: "Ambos" },
];

export function FinishFormModal({ finish, onClose, onSaved }: {
  finish?: Finish;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(finish?.name ?? "");
  const [code, setCode] = useState(finish?.code ?? "");
  const [type, setType] = useState<FinishInput["type"]>(finish?.type ?? "panel");
  const [photo, setPhoto] = useState<File | null>(null);
  const [repeatScale, setRepeatScale] = useState(String(finish?.repeatScale ?? 2));
  const [roughness, setRoughness] = useState(String(finish?.roughness ?? 0.5));
  const [extraCostPerM2, setExtraCostPerM2] = useState(String(finish?.extraCostPerM2 ?? 0));
  const [active, setActive] = useState(finish?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !code.trim() || (!finish && !photo)) {
      setError("Nombre, código y una foto son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    const input: FinishInput = {
      name: name.trim(),
      code: code.trim(),
      type,
      photo: photo ?? undefined,
      repeatScale: Number(repeatScale),
      roughness: Number(roughness),
      extraCostPerM2: Number(extraCostPerM2),
      active,
    };
    try {
      if (finish) {
        await updateFinish(finish.id, input);
      } else {
        await createFinish(input);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible guardar el acabado.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">{finish ? "Editar acabado" : "Nuevo acabado"}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Nombre</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Granito Negro Absoluto" />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Código</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="granito_negro_absoluto" className="font-mono text-sm" />
            <p className="text-[11px] text-zinc-500">Para cubiertas, debe coincidir con el `finishCode` del modelo en el catálogo para que se aplique automáticamente.</p>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Aplica a</label>
            <select value={type} onChange={(e) => setType(e.target.value as FinishInput["type"])} className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white">
              {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value} className="bg-zinc-900">{t.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Foto{finish ? " (opcional, deja vacío para conservar la actual)" : ""}</label>
            <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="block w-full text-sm text-zinc-300" />
            {finish && !photo && (
              <img src={finish.textureUrl} alt="" className="mt-2 h-20 w-20 rounded-lg border border-white/10 object-cover" />
            )}
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Rugosidad ({roughness}) — Mate ↔ Alto brillo
            </label>
            <input type="range" min="0" max="1" step="0.05" value={roughness} onChange={(e) => setRoughness(e.target.value)} className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Repetición</label>
              <Input type="number" value={repeatScale} onChange={(e) => setRepeatScale(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Costo extra/m²</label>
              <Input type="number" value={extraCostPerM2} onChange={(e) => setExtraCostPerM2(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
            Activo
          </label>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
        <div className="shrink-0 border-t border-white/10 p-4">
          <Button className="w-full" disabled={saving} onClick={handleSubmit}>
            {saving ? "Guardando..." : finish ? "Guardar cambios" : "Crear acabado"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Write the list page**

```typescript
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteFinish, listFinishes, updateFinish, type Finish } from "@/services/api";
import { FinishFormModal } from "@/components/finishes/FinishFormModal";

export default function FinishesPage() {
  const [finishes, setFinishes] = useState<Finish[] | null>(null);
  const [editing, setEditing] = useState<Finish | "new" | null>(null);

  const reload = () => listFinishes().then(setFinishes);

  useEffect(() => {
    reload();
  }, []);

  const handleSaved = () => {
    setEditing(null);
    reload();
  };

  const handleToggle = async (finish: Finish) => {
    await updateFinish(finish.id, { active: !finish.active });
    reload();
  };

  const handleDelete = async (finish: Finish) => {
    if (!window.confirm(`¿Eliminar "${finish.name}"? Esta acción no se puede deshacer.`)) return;
    await deleteFinish(finish.id);
    reload();
  };

  return (
    <AppShell title="Acabados / Texturas" subtitle="Catálogo fotográfico de acabados para paneles y cubiertas">
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold">CRUD de acabados</h3>
            <p className="text-sm text-zinc-400">Sube una foto y se convierte automáticamente en textura tileable.</p>
          </div>
          <Button onClick={() => setEditing("new")}>Nuevo acabado</Button>
        </div>
        {!finishes ? (
          <p className="text-sm text-zinc-400">Cargando...</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/5 text-zinc-400">
                <tr>{['', 'Nombre', 'Código', 'Aplica a', 'Costo extra/m²', 'Estado', 'Acciones'].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr>
              </thead>
              <tbody>
                {finishes.map((finish) => (
                  <tr key={finish.id} className="border-t border-white/6">
                    <td className="px-4 py-4">
                      <img src={finish.textureUrl} alt="" className="h-10 w-10 rounded-lg border border-white/10 object-cover" />
                    </td>
                    <td className="px-4 py-4 font-medium text-white">{finish.name}</td>
                    <td className="px-4 py-4 font-mono text-xs text-zinc-400">{finish.code}</td>
                    <td className="px-4 py-4"><Badge tone={finish.type === 'panel' ? 'indigo' : finish.type === 'cubierta' ? 'amber' : 'emerald'}>{finish.type}</Badge></td>
                    <td className="px-4 py-4 text-zinc-400">{finish.extraCostPerM2 > 0 ? `+$${finish.extraCostPerM2}` : "—"}</td>
                    <td className="px-4 py-4"><Badge tone={finish.active ? 'emerald' : 'rose'}>{finish.active ? 'Activo' : 'Inactivo'}</Badge></td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" className="h-9" onClick={() => setEditing(finish)}>Editar</Button>
                        <Button variant="ghost" className="h-9" onClick={() => handleToggle(finish)}>{finish.active ? "Desactivar" : "Activar"}</Button>
                        <Button variant="danger" className="h-9" onClick={() => handleDelete(finish)}>Eliminar</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <FinishFormModal
          finish={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </AppShell>
  );
}
```

- [ ] **Step 3: Add the Sidebar entry**

In `frontend/components/layout/Sidebar.tsx`, add `Palette` (or another distinct `lucide-react` icon not already used) to the import line, and add a new entry right after `/materials`:

```typescript
import { BarChart3, Boxes, FileText, LayoutDashboard, Palette, PlusSquare, Shirt, UtensilsCrossed, X } from "lucide-react";
```

```typescript
  { href: "/materials", label: "Materiales", icon: Boxes },
  { href: "/finishes", label: "Acabados", icon: Palette },
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Manual verification**

Start the frontend + backend dev servers, log in, navigate to `/finishes`, create a finish with a real photo, confirm it appears in the list with a thumbnail and the correct type badge, then edit it (change name only, confirm the photo/texture doesn't change) and delete it.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/finishes/page.tsx frontend/components/finishes/FinishFormModal.tsx frontend/components/layout/Sidebar.tsx
git commit -m "feat(frontend): add Acabados/Texturas admin CRUD page"
```

---

### Task 12: Frontend — load finishes into the kitchen builder

**Files:**
- Modify: `frontend/components/kitchen/KitchenBuilder.tsx`

**Interfaces:**
- Consumes: `useKitchenStore().loadFinishes()` (Task 6).

- [ ] **Step 1: Call `loadFinishes()` on mount**

Find (around lines 110-115):

```typescript
  // Fire-and-forget — pricing uses hardcoded fallbacks until this
  // resolves, then re-renders once loaded since getMaterials() reads
  // live store state. No loading gate on the builder UI for this.
  useEffect(() => {
    useKitchenStore.getState().loadMaterialCosts();
  }, []);
```

Replace with:

```typescript
  // Fire-and-forget — pricing/textures use hardcoded fallbacks until
  // these resolve, then re-render once loaded since getMaterials()/
  // getFinishTexture() read live store state. No loading gate on the
  // builder UI for either.
  useEffect(() => {
    useKitchenStore.getState().loadMaterialCosts();
    useKitchenStore.getState().loadFinishes();
  }, []);
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors across the whole frontend.

- [ ] **Step 3: End-to-end manual verification**

With both dev servers running: create a finish of type `panel` via `/finishes`, open the kitchen builder, select a lower cabinet, open "Acabado / textura" under Materiales, confirm the uploaded finish's thumbnail appears alongside the 4 built-ins and applying it changes the cabinet's rendered texture in the 3D view. Then create a finish with `code: "postformado_blanco"` (matching a seeded `COUNTERTOP_MODELS` entry) and type `cubierta`, select a countertop module, pick the "Postformado Blanco" model, and confirm the countertop now renders the uploaded photo texture instead of the flat color.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/kitchen/KitchenBuilder.tsx
git commit -m "feat(frontend): load finishes catalog on kitchen builder mount"
```

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1), upload/processing pipeline (Task 2-3), unified texture registry (Task 6-7), backend+admin CRUD (Task 3-4, 11), panel/countertop integration (Task 8-9), pricing (Task 10), wiring (Task 12) — every spec section has a task.
- **Placeholder scan:** no TBD/TODO; the one genuinely deferred item (Cloudflare storage swap) is called out explicitly in Global Constraints as intentionally out of scope, with the concrete interim implementation (`public` disk) given in full, not stubbed.
- **Type consistency:** `Finish`/`FinishInput` (Task 4) reused verbatim by Task 6 (store), Task 8 (picker), Task 10 (pricing, with a circular-import fallback noted), and Task 11 (admin page) — same field names throughout (`textureUrl`, `swatchColor`, `repeatScale`, `roughness`, `extraCostPerM2`, `code`, `type`). `getFinishTexture`/`getFinishRoughness` names match between Task 7's definition and Task 9's call sites.
