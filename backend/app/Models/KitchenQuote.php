<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KitchenQuote extends Model
{
    protected $fillable = [
        'kitchen_project_id',
        'folio',
        'subtotal_materials',
        'labor_percentage',
        'profit_percentage',
        'labor_cost',
        'profit_cost',
        'total',
        'material_lines',
        'status',
        'valid_until',
    ];

    protected $casts = [
        'material_lines'     => 'array',
        'subtotal_materials' => 'decimal:2',
        'labor_cost'         => 'decimal:2',
        'profit_cost'        => 'decimal:2',
        'total'              => 'decimal:2',
        'valid_until'        => 'date',
    ];

    public function kitchenProject(): BelongsTo
    {
        return $this->belongsTo(KitchenProject::class);
    }
}
