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
        'wall',
        'position',
        'height',
        'width',
        'depth',
        'options',
    ];

    protected $casts = [
        'options' => 'array',
        'height'  => 'integer',
        'width'   => 'integer',
        'depth'   => 'integer',
        'position' => 'integer',
    ];

    public function kitchenProject(): BelongsTo
    {
        return $this->belongsTo(KitchenProject::class);
    }
}
