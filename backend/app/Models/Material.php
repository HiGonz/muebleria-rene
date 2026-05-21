<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Material extends Model
{
    protected $fillable = ['name', 'type', 'unit', 'cost_per_unit', 'stock', 'active'];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'cost_per_unit' => 'float',
            'stock' => 'float',
        ];
    }
}
