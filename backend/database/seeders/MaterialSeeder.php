<?php

namespace Database\Seeders;

use App\Models\Material;
use Illuminate\Database\Seeder;

class MaterialSeeder extends Seeder
{
    public function run(): void
    {
        collect([
            ['name' => 'MDF 15mm', 'type' => 'Tablero', 'unit' => 'm²', 'cost_per_unit' => 160, 'stock' => 24],
            ['name' => 'MDF 18mm', 'type' => 'Tablero', 'unit' => 'm²', 'cost_per_unit' => 180, 'stock' => 32],
            ['name' => 'Melamina blanca 18mm', 'type' => 'Tablero', 'unit' => 'm²', 'cost_per_unit' => 210, 'stock' => 28],
            ['name' => 'Melamina nogal 18mm', 'type' => 'Tablero', 'unit' => 'm²', 'cost_per_unit' => 245, 'stock' => 18],
            ['name' => 'Triplay 9mm', 'type' => 'Tablero', 'unit' => 'm²', 'cost_per_unit' => 135, 'stock' => 20],
            ['name' => 'Triplay 12mm', 'type' => 'Tablero', 'unit' => 'm²', 'cost_per_unit' => 195, 'stock' => 16],
            ['name' => 'Bisagra 35mm', 'type' => 'Herraje', 'unit' => 'pzas', 'cost_per_unit' => 35, 'stock' => 100],
            ['name' => 'Corredera telescópica 450mm', 'type' => 'Herraje', 'unit' => 'pares', 'cost_per_unit' => 95, 'stock' => 48],
            ['name' => 'Canto PVC 0.4mm', 'type' => 'Acabado', 'unit' => 'ml', 'cost_per_unit' => 12, 'stock' => 200],
            ['name' => 'Tornillo confimát', 'type' => 'Fijación', 'unit' => 'pzas', 'cost_per_unit' => 2.5, 'stock' => 850],
            ['name' => 'Jalador moderno', 'type' => 'Herraje', 'unit' => 'pzas', 'cost_per_unit' => 60, 'stock' => 75],
        ])->each(fn (array $item) => Material::updateOrCreate(['name' => $item['name']], [...$item, 'active' => true]));
    }
}
