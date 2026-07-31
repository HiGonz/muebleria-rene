<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectDimension extends Model
{
    protected $fillable = ['project_id', 'height', 'width', 'depth', 'shelves', 'drawers', 'doors'];

    protected $casts = [
        'height' => 'float',
        'width' => 'float',
        'depth' => 'float',
        'shelves' => 'integer',
        'drawers' => 'integer',
        'doors' => 'integer',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
