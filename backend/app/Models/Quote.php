<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Quote extends Model
{
    protected $fillable = [
        'project_id', 'subtotal_materials', 'labor_percentage', 'profit_percentage', 'labor_cost', 'profit_cost', 'total', 'status', 'folio', 'valid_until',
    ];

    protected function casts(): array
    {
        return [
            'valid_until' => 'date',
            'subtotal_materials' => 'float',
            'labor_percentage' => 'float',
            'profit_percentage' => 'float',
            'labor_cost' => 'float',
            'profit_cost' => 'float',
            'total' => 'float',
        ];
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
