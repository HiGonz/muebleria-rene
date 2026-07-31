<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KitchenModule extends Model
{
    protected $fillable = [
        'kitchen_project_id',
        'module_type',
        'category',
        'label',
        'height',
        'width',
        'depth',
        'x',
        'z',
        'rotation',
        'options',
    ];

    protected $casts = [
        'options'  => 'array',
        'height'   => 'integer',
        'width'    => 'integer',
        'depth'    => 'integer',
        // Not integer — see the widen_kitchen_modules_position_precision
        // migration: a module snapped flush against a neighbor needs
        // sub-centimeter precision to stay flush through a save/reload.
        'x'        => 'float',
        'z'        => 'float',
        'rotation' => 'integer',
    ];

    public function kitchenProject(): BelongsTo
    {
        return $this->belongsTo(KitchenProject::class);
    }
}
