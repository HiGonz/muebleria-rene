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
        'x'        => 'integer',
        'z'        => 'integer',
        'rotation' => 'integer',
    ];

    public function kitchenProject(): BelongsTo
    {
        return $this->belongsTo(KitchenProject::class);
    }
}
